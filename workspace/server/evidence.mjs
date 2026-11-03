import { z } from "zod";
import { EvidenceResult } from "../src/analysis-contract.ts";
export const EvidenceSelection = z
  .object({
    evidence: z
      .array(
        z
          .object({
            id: z.string(),
            referenceId: z.string(),
            statement: z.string(),
          })
          .strict(),
      )
      .max(40),
    gaps: z.array(z.string()).max(20),
  })
  .strict();
// References belong to the immutable input. Models never author source IDs, pages or quotations.
export function evidenceCatalog(input) {
  return input.sources.flatMap((s, sourceIndex) => {
    const refs = [],
      prefix = `source${sourceIndex + 1}`,
      pages = s.pageTexts ?? [s.text];
    pages.forEach((text, p) => {
      let start = 0,
        index = 0;
      while (start < text.length) {
        let end = Math.min(start + 650, text.length);
        if (end < text.length) {
          const boundary = text.lastIndexOf(" ", end);
          if (boundary > start + 200) end = boundary;
        }
        const quote = text.slice(start, end).trim();
        if (quote)
          refs.push({
            id: `${prefix}.page${p + 1}.text${++index}`,
            sourceId: s.id,
            page: s.kind === "pdf" ? p + 1 : null,
            kind: "quote",
            quote,
          });
        start = end;
      }
    });
    if (s.kind === "image")
      refs.push({
        id: `${prefix}.image`,
        sourceId: s.id,
        page: null,
        kind: "visual",
        quote: "",
      });
    if (s.kind === "pdf")
      for (let p = 1; p <= s.pageCount; p++)
        refs.push({
          id: `${prefix}.page${p}.visual`,
          sourceId: s.id,
          page: p,
          kind: "visual",
          quote: "",
        });
    return refs;
  });
}
export function groundSelection(value, input) {
  const data = EvidenceSelection.parse(value),
    catalog = evidenceCatalog(input);
  return EvidenceResult.parse({
    gaps: data.gaps,
    evidence: data.evidence.map((e) => {
      const ref = catalog.find((s) => s.id === e.referenceId);
      if (!ref)
        throw new Error(`Unknown source reference for evidence ${e.id}.`);
      return {
        id: e.id,
        sourceId: ref.sourceId,
        kind: ref.kind,
        page: ref.page,
        quote: ref.quote,
        statement: e.statement,
      };
    }),
  });
}
