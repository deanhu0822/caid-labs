import { ANALYSIS_LIMITS } from "./analysis-limits";
import { createBrief, type Draft, type Brief } from "./domain";
import { emptyWorkflow } from "./workflow";
import type { RunResult, AnalysisSource } from "./analysis-contract";
async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/analysis/${path}`, init);
  let b;
  try {
    b = await r.json();
  } catch {
    throw new Error(
      "The analysis server is unavailable. Your inputs are retained.",
    );
  }
  if (!r.ok) throw new Error(b.error || "Analysis request failed.");
  return b;
}
export const analysisStatus = () =>
  api("status") as Promise<{
    configured: boolean;
    model: string;
    harnessVersion: string;
  }>;
export const readRun = (id: string) =>
  api(`runs/${encodeURIComponent(id)}`) as Promise<RunResult>;
/** Keep user annotations separate from the bytes of the attached documents. */
export function analysisObjective(draft:Draft):string {
 const context=draft.workflow?Object.fromEntries(['target','baseline','current','proposed','unchanged'].map(k=>[k,(draft.workflow as unknown as Record<string,string>)[k]]).filter(([,v])=>typeof v==='string'&&v.trim())):{};
 const notes=draft.sources.filter(s=>s.note.trim()||s.appliesTo?.trim()||s.locator?.trim()).map(s=>({sourceId:s.id,sourceName:s.name,note:s.note,appliesTo:s.appliesTo,location:s.locator}));
 return [draft.request,Object.keys(context).length?'WORKSPACE CONTEXT (unverified; the objective takes precedence):\n'+JSON.stringify(context):'',notes.length?'USER SOURCE ANNOTATIONS (separate from attached document content):\n'+JSON.stringify(notes):''].filter(Boolean).join('\n\n');
}
export const analysisFingerprint=(draft:Draft)=>JSON.stringify([analysisObjective(draft),draft.sources.map(s=>s.id)]);
export async function startAnalysis(
  draft: Draft,
  key: string,
): Promise<RunResult> {
  if(analysisObjective(draft).length>ANALYSIS_LIMITS.objectiveCharacters)throw new Error('The objective, context and source notes are too long. Shorten them before analysis; your input is retained.');
  if (
    draft.sources.reduce((n, s) => n + s.size, 0) > ANALYSIS_LIMITS.totalBytes
  )
    throw new Error(
      "Live analysis accepts up to 24 MB of attachments in total.",
    );
  if (
    draft.sources.some(
      (s) => s.kind === "image" && s.size > ANALYSIS_LIMITS.imageBytes,
    )
  )
    throw new Error(
      "Use images up to 5 MB for live analysis. Your original files remain saved.",
    );
  const sources: AnalysisSource[] = [];
  for (const s of draft.sources) {
    if (!s.blob)
      throw new Error(
        `Reattach ${s.name} before live analysis; original bytes are missing.`,
      );
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(s.blob!);
    });
    sources.push({
      id: s.id,
      name: s.name,
      kind: s.kind,
      mime: s.mime,
      data,
      text: "",
    });
  }
  return api("runs", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ objective: analysisObjective(draft), sources }),
  });
}
export const cancelRun = (id: string) =>
  api(`runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const feedback = (id: string, note: string, verdict: string) =>
  api(`runs/${encodeURIComponent(id)}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note, verdict }),
  });
export function briefFromRun(draft: Draft, run: RunResult): Brief {
  if (run.status !== "ready" || !run.output)
    throw new Error("Analysis is not ready.");
  const { evidence, proposal } = run.output,
    original = draft.workflow ?? emptyWorkflow(),
    b = createBrief(draft.request, draft.sources);
  const refs = (ids: string[]) => [
    ...new Set(
      evidence.evidence
        .filter((e) => ids.includes(e.id))
        .map((e) => e.sourceId),
    ),
  ];
  b.title = proposal.title.slice(0, 120);
  b.generation = `Anthropic · ${run.model} · ${run.harnessVersion} · Run ${run.id}. AI-generated draft for human review; no engineering validation performed.`;
  b.analysis = {
    runId: run.id,
    model: run.model,
    harnessVersion: run.harnessVersion,
    inputHash: run.inputHash,
  };
  b.observations = evidence.evidence.map((e) => ({
    id: e.id,
    sourceId: e.sourceId,
    text:
      e.kind === "visual"
        ? `Visual interpretation — unverified: ${e.statement}`
        : e.statement,
    ...(e.quote ? { quote: e.quote } : {}),
    ...(e.page ? { page: e.page } : {}),
  }));
  b.workflow = {
    ...original,
    target: original.target || proposal.items[0].name,
    current: proposal.current,
    proposed: proposal.options
      .map(
        (o, i) =>
          `Option ${i + 1}: ${o.title}\n${o.change}\nWhy: ${o.rationale}\nEvidence: ${o.evidenceIds.join(", ")}`,
      )
      .join("\n\n"),
    unchanged: proposal.unchanged,
    status: "Draft",
    items: proposal.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      revision: "",
      category: i.category,
      origin: "analysis",
      sourceIds: refs(i.evidenceIds),
    })),
    links: proposal.links.map((l) => ({
      ...l,
      sourceIds: refs(l.evidenceIds),
      basis: "inferred",
    })),
    comments: [
      ...proposal.questions,
      ...evidence.gaps,
      "Confirm the baseline, source applicability, and measured validation before an engineering decision.",
    ].map((text) => ({ id: crypto.randomUUID(), text, resolved: false })),
  };
  b.nextSteps = proposal.options.flatMap((o, i) =>
    o.checks.map((text) => ({
      id: crypto.randomUUID(),
      text: `Option ${i + 1}: ${text}`,
      done: false,
    })),
  );
  return b;
}
