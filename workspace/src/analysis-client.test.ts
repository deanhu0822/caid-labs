import { describe, it, expect } from "vitest";
import { analysisObjective,analysisFingerprint,briefFromRun } from "./analysis-client";
import {
  draftForArtifact,
  validateBrief,
  exportMarkdown,
  type Draft,
} from "./domain";
import type { RunResult } from "./analysis-contract";
const draft: Draft = {
  request: "Reduce thermal bias without changing interface",
  sources: [
    {
      id: "guide",
      name: "Guide.pdf",
      kind: "pdf",
      mime: "application/pdf",
      size: 10,
      text: "Separate heat sources.",
      pageTexts: ["Separate heat sources.", ""],
      pageCount: 2,
      status: "ready",
      note: "",
      blob: new Blob(["fixture"]),
    },
    {
      id: "image",
      name: "Layout.png",
      kind: "image",
      mime: "image/png",
      size: 1,
      text: "",
      note: "",
      status: "reference",
    },
  ],
};
const run: RunResult = {
  id: "run-1",
  status: "ready",
  stage: "Ready for human review",
  model: "test-model",
  harnessVersion: "test-v1",
  inputHash: "f".repeat(64),
  output: {
    evidence: {
      evidence: [
        {
          id: "E1",
          sourceId: "guide",
          page: 1,
          kind: "quote",
          quote: "Separate heat sources.",
          statement: "A source-backed guideline",
        },
        {
          id: "E2",
          sourceId: "image",
          page: null,
          kind: "visual",
          quote: "",
          statement: "A wall is shown.",
        },
      ],
      gaps: ["Dimensions unknown."],
    },
    proposal: {
      title: "Air monitor",
      current: "Baseline unknown",
      unchanged: "Digital interface",
      items: [
        {
          id: "p",
          name: "Air monitor",
          category: "overview",
          description: "Product",
          evidenceIds: [],
        },
        {
          id: "s",
          name: "Sensor",
          category: "pcb",
          description: "Thermal path unknown",
          evidenceIds: ["E1", "E2"],
        },
      ],
      links: [
        {
          id: "l",
          from: "p",
          to: "s",
          relation: "contains",
          evidenceIds: ["E1"],
        },
      ],
      options: [
        {
          title: "Thermal separation",
          change: "Evaluate slits",
          rationale: "Reduce conduction",
          affectedIds: ["s"],
          evidenceIds: ["E1"],
          checks: ["Measure bias at controlled loads"],
        },
      ],
      questions: ["Confirm baseline."],
    },
  },
};
describe("live proposal handoff", () => {
  it("preserves model provenance, source pages and unconfirmed relationships through storage and export", () => {
    const b = validateBrief(briefFromRun(draft, run));
    expect(b.analysis?.inputHash).toBe(run.inputHash);
    expect(b.workflow?.items[1].sourceIds).toEqual(["guide", "image"]);
    expect(b.workflow?.links[0].sourceIds).toEqual(["guide"]);
    expect(b.workflow?.links[0].basis).toBe("inferred");
    expect(b.observations[1].text).toContain("unverified");
    expect(b.observations[0].page).toBe(1);
    expect(exportMarkdown(b)).toContain("AI-assisted review draft");
    expect(exportMarkdown(b)).toContain(run.inputHash);
    expect(exportMarkdown(b)).not.toContain(
      "No engineering approval or model analysis is implied",
    );
  });
  it("does not turn a failed run into a review", () =>
    expect(() => briefFromRun(draft, { ...run, status: "failed" })).toThrow(
      "not ready",
    ));
  it("a graph-originated change carries sources and artifacts without copying the previous proposal", () => {
    const b = briefFromRun(draft, run),
      d = draftForArtifact({ request: "", sources: [] }, b, "Sensor");
    expect(d.sources).toEqual(draft.sources);
    expect(d.workflow?.items).toEqual(b.workflow?.items);
    expect(d.workflow?.proposed).toBe("");
    expect(d.workflow?.target).toBe("Sensor");
    expect(d.workflow?.status).toBe("Draft");
  });
  it("retains an unfinished objective and its attachments when focusing an artifact", () => {
    const d = draftForArtifact(draft, briefFromRun(draft, run), "Sensor");
    expect(d.request).toBe(draft.request);
    expect(d.sources).toBe(draft.sources);
  });
  it("accepts a cited image-only PDF page, without pretending it has extracted text", () => {
    const b = briefFromRun(draft, run);
    b.observations = [
      {
        id: "v",
        sourceId: "guide",
        page: 2,
        text: "Unverified visual observation",
      },
    ];
    expect(validateBrief(b).observations[0].page).toBe(2);
  });
});

it('the live objective includes selected target and explicit source annotations',()=>{const b=briefFromRun(draft,run),d=draftForArtifact({...draft,sources:draft.sources.map(s=>({...s,note:'Keep exterior vent locations unchanged.'}))},b,'Sensor');expect(analysisObjective(d)).toContain('"target":"Sensor"');expect(analysisObjective(d)).toContain('Keep exterior vent locations unchanged.');expect(analysisFingerprint(d)).not.toBe(analysisFingerprint(draft));expect(d.request).toBe(draft.request);});
