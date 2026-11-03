import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceCatalog, groundSelection } from "./evidence.mjs";
import { verifyEvidence } from "../src/analysis-contract.ts";
const input = {
  objective: "Reduce thermal bias",
  sources: [
    {
      id: "guide",
      sha256: "abc123abcdef".repeat(5),
      kind: "pdf",
      pageCount: 2,
      pageTexts: [
        "An unrelated introduction.",
        "Keep heat sources away from the sensor.",
      ],
      text: "",
    },
  ],
};
test("selected PDF spans preserve exact text and authoritative physical page", () => {
  const span = evidenceCatalog(input)[1];
  const data = groundSelection(
    {
      evidence: [
        {
          id: "e1",
          referenceId: span.id,
          statement: "Move the regulator away.",
        },
      ],
      gaps: [],
    },
    input,
  );
  assert.equal(data.evidence[0].quote, input.sources[0].pageTexts[1]);
  assert.equal(data.evidence[0].page, 2);
  assert.doesNotThrow(() => verifyEvidence(data, input.sources));
});
test("a fabricated reference cannot become evidence", () =>
  assert.throws(
    () =>
      groundSelection(
        {
          evidence: [
            { id: "e1", referenceId: "invented", statement: "Statement" },
          ],
          gaps: [],
        },
        input,
      ),
    /Unknown source reference/,
  ));
test("image and PDF visual references bind the source and physical page automatically", () => {
  const i = {
    sources: [...input.sources, { id: "image", kind: "image", text: "" }],
  };
  const r = groundSelection(
    {
      evidence: [
        {
          id: "e1",
          referenceId: "source2.image",
          statement: "Image observation",
        },
        {
          id: "e2",
          referenceId: "source1.page2.visual",
          statement: "PDF figure",
        },
      ],
      gaps: [],
    },
    i,
  );
  assert.equal(r.evidence[0].sourceId, "image");
  assert.equal(r.evidence[0].page, null);
  assert.equal(r.evidence[1].sourceId, "guide");
  assert.equal(r.evidence[1].page, 2);
  assert.doesNotThrow(() => verifyEvidence(r, i.sources));
});
test("long pages are bounded into stable spans without losing words", () => {
  const text = "alpha beta gamma delta ".repeat(200);
  const i = {
    sources: [{ id: "s", sha256: "f".repeat(64), kind: "text", text }],
  };
  const spans = evidenceCatalog(i);
  assert.equal(spans.map((s) => s.quote).join(" "), text.trim());
  assert(spans.every((s) => s.quote.length <= 650));
  assert.deepEqual(evidenceCatalog(i), spans);
});
