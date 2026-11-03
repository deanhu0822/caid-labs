import { z } from "zod";
import { ARTIFACT_CATEGORIES } from "./product-types.ts";
const short = z.string().trim().min(1).max(4000);
const id = z.string().regex(/^[\w:-]{1,100}$/);
export const categories = ARTIFACT_CATEGORIES.filter((c) => c !== "agents");
export const Evidence = z
  .object({
    id,
    sourceId: id,
    page: z.number().int().positive().nullable(),
    kind: z.enum(["quote", "visual"]),
    quote: z.string().max(6000),
    statement: short,
  })
  .strict();
export const EvidenceResult = z
  .object({ evidence: z.array(Evidence).max(40), gaps: z.array(short).max(20) })
  .strict();
export const ProposalResult = z
  .object({
    title: short,
    current: short,
    unchanged: short,
    items: z
      .array(
        z
          .object({
            id,
            name: short,
            category: z.enum(categories),
            description: short,
            evidenceIds: z.array(id).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    links: z
      .array(
        z
          .object({
            id,
            from: id,
            to: id,
            relation: z.enum([
              "contains",
              "routes",
              "drives",
              "sourced",
              "validated",
              "depends",
            ]),
            evidenceIds: z.array(id).max(20),
          })
          .strict(),
      )
      .max(120),
    options: z
      .array(
        z
          .object({
            title: short,
            change: short,
            rationale: short,
            affectedIds: z.array(id).max(60),
            evidenceIds: z.array(id).min(1).max(20),
            checks: z.array(short).min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    questions: z.array(short).max(20),
  })
  .strict();
export const CritiqueResult = z
  .object({ passed: z.boolean(), issues: z.array(short).max(30) })
  .strict();
export type EvidenceData = z.infer<typeof EvidenceResult>;
export type ProposalData = z.infer<typeof ProposalResult>;
export type RunResult = {
  id: string;
  status: string;
  stage: string;
  model: string;
  harnessVersion: string;
  error?: string;
  output?: { evidence: EvidenceData; proposal: ProposalData };
  events?: { stage: string; message: string; at: string }[];
  usage?: { input: number; output: number };
  inputHash: string;
};
export type AnalysisSource = {
  id: string;
  name: string;
  kind: string;
  mime: string;
  data: string;
  text: string;
  pageTexts?: string[];
  pageCount?: number;
  sha256?: string;
};
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
export function verifyEvidence(
  value: unknown,
  sources: AnalysisSource[],
): EvidenceData {
  const data = EvidenceResult.parse(value),
    ids = new Set<string>();
  for (const e of data.evidence) {
    if (ids.has(e.id)) throw new Error("Duplicate evidence ID.");
    ids.add(e.id);
    const s = sources.find((s) => s.id === e.sourceId);
    if (!s) throw new Error("Unknown evidence source.");
    if (s.kind === "pdf" && (!e.page || e.page > (s.pageCount ?? 0)))
      throw new Error("Evidence needs a valid PDF page.");
    if (s.kind !== "pdf" && e.page !== null)
      throw new Error("Only PDF evidence can have a page.");
    if (e.kind === "quote") {
      const text = e.page ? (s.pageTexts?.[e.page - 1] ?? "") : s.text;
      if (!e.quote.trim() || !normalize(text).includes(normalize(e.quote)))
        throw new Error(
          "Quoted evidence does not match the original source text.",
        );
    } else if (!["pdf", "image"].includes(s.kind) || e.quote !== "")
      throw new Error(
        "Visual evidence must point to an image or PDF and cannot pretend to be a verified quotation.",
      );
  }
  return data;
}
export function verifyProposal(
  value: unknown,
  evidence: EvidenceData,
): ProposalData {
  const data = ProposalResult.parse(value),
    refs = new Set(evidence.evidence.map((e) => e.id)),
    items = new Set(data.items.map((i) => i.id));
  if (items.size !== data.items.length)
    throw new Error("Duplicate artifact ID.");
  const links = new Set<string>();
  const check = (ids: string[]) => {
    if (ids.some((i) => !refs.has(i)))
      throw new Error("Proposal cites unknown evidence.");
  };
  for (const i of data.items) check(i.evidenceIds);
  for (const l of data.links) {
    check(l.evidenceIds);
    if (
      links.has(l.id) ||
      !items.has(l.from) ||
      !items.has(l.to) ||
      l.from === l.to
    )
      throw new Error("Invalid artifact relationship.");
    links.add(l.id);
    if (l.relation !== "contains" && !l.evidenceIds.length)
      throw new Error("A functional relationship requires source evidence.");
  }
  for (const o of data.options) {
    check(o.evidenceIds);
    if (o.affectedIds.some((i) => !items.has(i)))
      throw new Error("Unknown affected artifact.");
  }
  return data;
}
