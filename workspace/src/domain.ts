import { emptyWorkflow, validateWorkflow, type Workflow } from "./workflow";
export type Source = {
  id: string;
  name: string;
  kind: "image" | "pdf" | "text" | "csv";
  mime: string;
  size: number;
  blob?: Blob;
  text: string;
  note: string;
  readNotice?: string;
  status: "ready" | "reference" | "error";
  error?: string;
  pageCount?: number;
  pageTexts?: string[];
  locator?: string;
  appliesTo?: string;
};

export type Observation = {
  id: string;
  text: string;
  sourceId?: string;
  quote?: string;
  page?: number;
};
export type NextStep = { id: string; text: string; done: boolean };
export type Draft = { request: string; sources: Source[]; workflow?: Workflow };
export type Brief = {
  analysis?: {
    runId: string;
    model: string;
    harnessVersion: string;
    inputHash: string;
  };
  generation?: string;
  id: string;
  title: string;
  request: string;
  sources: Source[];
  observations: Observation[];
  nextSteps: NextStep[];
  workflow?: Workflow;
  createdAt: string;
  updatedAt: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} is invalid.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && !value.trim()))
    throw new Error(`${label} is invalid.`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function uniqueIds<T extends { id: string }>(values: T[], label: string): T[] {
  if (new Set(values.map((value) => value.id)).size !== values.length)
    throw new Error(`${label} contains duplicate IDs.`);
  return values;
}

function source(value: unknown): Source {
  const item = record(value, "Source");
  if (
    typeof item.kind !== "string" ||
    !["image", "pdf", "text", "csv"].includes(item.kind)
  )
    throw new Error("Source type is invalid.");
  if (
    typeof item.status !== "string" ||
    !["ready", "reference", "error"].includes(item.status)
  )
    throw new Error("Source status is invalid.");
  if (
    typeof item.size !== "number" ||
    !Number.isSafeInteger(item.size) ||
    item.size < 0
  )
    throw new Error("Source size is invalid.");
  if (item.blob !== undefined && !(item.blob instanceof Blob))
    throw new Error("Source file is invalid.");
  if (
    item.pageCount !== undefined &&
    (typeof item.pageCount !== "number" ||
      !Number.isSafeInteger(item.pageCount) ||
      item.pageCount < 1)
  )
    throw new Error("Page count is invalid.");
  return {
    ...(item.locator === undefined
      ? {}
      : { locator: string(item.locator, "Source location") }),
    ...(item.appliesTo === undefined
      ? {}
      : { appliesTo: string(item.appliesTo, "Source target") }),
    ...(item.pageTexts === undefined
      ? {}
      : {
          pageTexts: array(item.pageTexts, "PDF pages").map((t) =>
            string(t, "Page text"),
          ),
        }),
    id: string(item.id, "Source ID", true),
    name: string(item.name, "Source name", true),
    kind: item.kind as Source["kind"],
    mime: string(item.mime, "Source format"),
    size: item.size,
    text: string(item.text, "Source text"),
    note: string(item.note, "Source note"),
    status: item.status as Source["status"],
    ...(item.blob === undefined ? {} : { blob: item.blob as Blob }),
    ...(item.error === undefined
      ? {}
      : { error: string(item.error, "Source error") }),
    ...(item.readNotice === undefined
      ? {}
      : { readNotice: string(item.readNotice, "Source reading notice") }),
    ...(item.pageCount === undefined
      ? {}
      : { pageCount: item.pageCount as number }),
  };
}

export function validateDraft(value: unknown): Draft {
  const item = record(value, "Draft");
  return {
    ...(item.workflow === undefined
      ? {}
      : { workflow: validateWorkflow(item.workflow) }),
    request: string(item.request, "Request"),
    sources: uniqueIds(array(item.sources, "Sources").map(source), "Sources"),
  };
}

/** Validate stored work before showing it; never silently turn damaged data into an empty brief. */
export function validateBrief(value: unknown): Brief {
  const item = record(value, "Brief");
  const draft = validateDraft(item);
  if (
    draft.workflow?.status === "Reviewed" &&
    !draft.sources.some(
      (s) => s.status !== "error" && s.appliesTo?.trim() && s.note.trim(),
    )
  )
    throw new Error("Reviewed record needs linked supporting evidence.");
  const sourceIds = new Set(draft.sources.map((entry) => entry.id));
  for (const part of draft.workflow?.items ?? [])
    if (part.sourceIds?.some((id) => !sourceIds.has(id)))
      throw new Error("Part refers to missing evidence.");
  const observations = uniqueIds(
    array(item.observations, "Observations").map((value): Observation => {
      const entry = record(value, "Observation");
      const sourceId =
        entry.sourceId === undefined
          ? undefined
          : string(entry.sourceId, "Observation source", true);
      if (sourceId && !sourceIds.has(sourceId))
        throw new Error("An observation refers to a missing source.");
      if (
        entry.page !== undefined &&
        (!Number.isInteger(entry.page) ||
          (entry.page as number) < 1 ||
          !sourceId ||
          draft.sources.find((s) => s.id === sourceId)?.kind !== "pdf" ||
          (entry.page as number) >
            (draft.sources.find((s) => s.id === sourceId)?.pageCount ??
              draft.sources.find((s) => s.id === sourceId)?.pageTexts?.length ??
              0))
      )
        throw new Error("Invalid evidence page.");
      return {
        ...(entry.quote === undefined
          ? {}
          : { quote: string(entry.quote, "Evidence quote") }),
        ...(entry.page === undefined ? {} : { page: entry.page as number }),
        id: string(entry.id, "Observation ID", true),
        text: string(entry.text, "Observation text"),
        ...(sourceId ? { sourceId } : {}),
      };
    }),
    "Observations",
  );
  const nextSteps = uniqueIds(
    array(item.nextSteps, "Next steps").map((value): NextStep => {
      const entry = record(value, "Next step");
      if (typeof entry.done !== "boolean")
        throw new Error("Next step status is invalid.");
      return {
        id: string(entry.id, "Next step ID", true),
        text: string(entry.text, "Next step text"),
        done: entry.done,
      };
    }),
    "Next steps",
  );
  const createdAt = string(item.createdAt, "Created date", true);
  const updatedAt = string(item.updatedAt, "Updated date", true);
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  )
    throw new Error("Brief dates are invalid.");
  return {
    id: string(item.id, "Brief ID", true),
    title: string(item.title, "Brief title"),
    ...draft,
    ...(item.analysis === undefined
      ? {}
      : {
          analysis: (() => {
            const a = record(item.analysis, "Analysis provenance");
            return {
              runId: string(a.runId, "Run ID", true),
              model: string(a.model, "Model", true),
              harnessVersion: string(a.harnessVersion, "Harness version", true),
              inputHash: string(a.inputHash, "Input digest", true),
            };
          })(),
        }),
    ...(item.generation === undefined
      ? {}
      : { generation: string(item.generation, "Draft provenance") }),
    observations,
    nextSteps,
    createdAt,
    updatedAt,
  };
}

/** Organize the supplied material. This deliberately makes no model call or engineering inference. */
export function createBrief(request: string, sources: Source[]): Brief {
  const input = validateDraft({ request, sources });
  if (!input.request.trim())
    throw new Error("Add a request before preparing a brief.");
  const firstLine = input.request.trim().split(/\r?\n/)[0];
  const title =
    firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}…` : firstLine;
  const observations: Observation[] = [];
  for (const item of input.sources) {
    // Reading a file does not make its first lines useful review notes.
    // Keep all extracted text in the source and promote only deliberate user notes.
    if (item.note.trim())
      observations.push({
        id: crypto.randomUUID(),
        text: `Note: ${item.note.trim()}`,
        sourceId: item.id,
      });
  }
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    request: input.request.trim(),
    sources: input.sources,
    observations,
    nextSteps: [],
    createdAt: now,
    updatedAt: now,
  };
}

function plain(value: string): string {
  return value.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&").replace(/\r?\n/g, " ");
}

function literal(value: string): string {
  const longestRun = Math.max(
    2,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(longestRun + 1);
  return `${fence}text\n${value}\n${fence}`;
}

/** The portable report includes every source's text and notes; binary originals remain in the workspace. */
export function exportMarkdown(value: Brief): string {
  const brief = validateBrief(value);
  const sourceNumber = new Map(
    brief.sources.map((item, index) => [item.id, index + 1]),
  );
  const parts = [
    `# ${plain(brief.title.trim() || "Untitled brief")}`,
    brief.analysis
      ? "AI-assisted review draft. No engineering approval or physical validation is implied."
      : "Reference review brief · Prepared from supplied material. No engineering approval or model analysis is implied.",
    `Updated: ${brief.updatedAt}`,
    ...(brief.generation ? [literal(brief.generation)] : []),
    ...(brief.analysis
      ? [`Immutable input SHA-256: ${plain(brief.analysis.inputHash)}`]
      : []),
    `## Request\n\n${literal(brief.request)}`,
    ...(brief.workflow
      ? [
          "## Review context",
          literal(
            [
              `Target: ${brief.workflow.target}`,
              `Baseline: ${brief.workflow.baseline}`,
              `Current design: ${brief.workflow.current ?? "Not recorded"}`,
              `Proposed: ${brief.workflow.proposed}`,
              `Unchanged: ${brief.workflow.unchanged}`,
              `Owner: ${brief.workflow.owner}`,
              `Reviewer: ${brief.workflow.reviewer}`,
              `Status: ${brief.workflow.status}`,
              "",
              "Parts:",
              ...brief.workflow.items.map(
                (i) =>
                  `${i.name} | ${i.revision} | ${i.description} | ${i.origin ?? "manual"}${i.sourceIds?.length ? ` | Text references: ${i.sourceIds.map((id) => brief.sources.find((s) => s.id === id)?.name).join(", ")}` : ""}`,
              ),
              "",
              "Connections:",
              ...brief.workflow.links.map(
                (l) =>
                  `${brief.workflow!.items.find((i) => i.id === l.from)?.name} → ${l.relation} → ${brief.workflow!.items.find((i) => i.id === l.to)?.name} [${l.basis ?? "user-entered"}]`,
              ),
              "",
              "Comments:",
              ...brief.workflow.comments.map(
                (c) => `${c.resolved ? "Resolved" : "Open"}: ${c.text}`,
              ),
            ].join("\n"),
          ),
        ]
      : []),
    "## Observations",
    ...(brief.observations.length
      ? brief.observations.map(
          (item) =>
            `${brief.analysis ? `Evidence ${plain(item.id)}: ` : ""}${literal(item.text)}${item.quote ? `\n\nSource passage${item.page ? ` · page ${item.page}` : ""}:\n${literal(item.quote)}` : ""}\n\n${item.sourceId ? `Source: [${plain(brief.sources.find((entry) => entry.id === item.sourceId)!.name)}](#source-${sourceNumber.get(item.sourceId)}).` : "User observation; no source attached."}`,
        )
      : ["No observations recorded."]),
    "## Next steps",
    ...(brief.nextSteps.length
      ? brief.nextSteps.map(
          (item) => `- [${item.done ? "x" : " "}] ${plain(item.text)}`,
        )
      : ["No next steps recorded."]),
    "## Sources",
    ...brief.sources.map((item, index) =>
      [
        `<a id="source-${index + 1}"></a>`,
        `### ${index + 1}. ${plain(item.name)}`,
        `Type: ${item.kind} · Size: ${item.size} bytes · Status: ${item.status}${item.pageCount ? ` · Pages: ${item.pageCount}` : ""}`,
        ...(item.locator ? [`Location: ${plain(item.locator)}`] : []),
        ...(item.appliesTo ? [`Applies to: ${plain(item.appliesTo)}`] : []),
        ...(item.error ? [`Import note: ${plain(item.error)}`] : []),
        ...(item.readNotice
          ? [`Reading notice: ${plain(item.readNotice)}`]
          : []),
        ...(item.note ? [`User note:\n\n${literal(item.note)}`] : []),
        item.text
          ? `Source text:\n\n${literal(item.text)}`
          : "No text extracted. Open the original file to inspect it.",
        ...(item.kind === "image"
          ? [
              brief.analysis
                ? "Visual interpretations are AI-generated and unverified; inspect the original image."
                : "Image text, when present, comes from OCR and may contain errors. Visual details have not been interpreted.",
            ]
          : []),
      ].join("\n\n"),
    ),
    "## About this export\n\nExcerpts are copied from supplied text. Edited observations and notes are user-authored. Check extracted text against the original. Binary attachments are not embedded in this Markdown report; their names, text, and notes are retained above. Original files remain in this browser workspace until removed. This workspace does not verify hardware or approve a change.",
  ];
  return `${parts.join("\n\n")}\n`;
}

/** Keep automatically copied notes in sync without replacing reviewer-authored observations. */
export function replaceBriefSource(brief: Brief, next: Source): Brief {
  const previous = brief.sources.find((s) => s.id === next.id);
  if (!previous) throw new Error("Source does not belong to this review.");
  const automaticText = `Note: ${previous.note.trim()}`;
  const automatic = brief.observations.find(
    (o) => o.sourceId === next.id && o.text === automaticText,
  );
  let observations = brief.observations.map((o) =>
    o === automatic ? { ...o, text: `Note: ${next.note.trim()}` } : o,
  );
  if (automatic && !next.note.trim())
    observations = observations.filter((o) => o.id !== automatic.id);
  if (!previous.note.trim() && next.note.trim() && !automatic)
    observations.push({
      id: crypto.randomUUID(),
      text: `Note: ${next.note.trim()}`,
      sourceId: next.id,
    });
  return {
    ...brief,
    sources: brief.sources.map((s) => (s.id === next.id ? next : s)),
    observations,
    workflow: brief.workflow
      ? { ...brief.workflow, status: "Draft" }
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Carry relevant saved evidence into a new change without replacing an unfinished objective. */
export function draftForArtifact(
  draft: Draft,
  context: Brief | undefined,
  target: string,
): Draft {
  const base = context?.workflow;
  const workflow = draft.workflow ?? {
    ...emptyWorkflow(),
    baseline: base?.baseline ?? "",
    current: base?.current ?? "",
    unchanged: base?.unchanged ?? "",
    items: base?.items ?? [],
    links: base?.links ?? [],
  };
  return {
    ...draft,
    sources: draft.sources.length ? draft.sources : (context?.sources ?? []),
    workflow: { ...workflow, target, status: "Draft" },
  };
}
