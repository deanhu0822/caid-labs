import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RunStore,
  AnthropicProvider,
  normalizeInput,
  executeRun,
} from "./harness.mjs";
import { evidenceCatalog } from "./evidence.mjs";
import { verifyEvidence, verifyProposal } from "../src/analysis-contract.ts";
const text = "The sensor should be thermally isolated from heat sources.";
const input = {
  objective: "Reduce heat bias in an I2C air monitor. Keep 3.3 V.",
  sources: [
    {
      id: "guide",
      name: "guide.txt",
      kind: "text",
      mime: "text/plain",
      sha256: "f".repeat(64),
      data: Buffer.from(text).toString("base64"),
      text,
    },
  ],
};
const evidence = {
  evidence: [
    {
      id: "e1",
      sourceId: "guide",
      page: null,
      kind: "quote",
      quote: text,
      statement: "Thermal isolation is source guidance.",
    },
  ],
  gaps: ["Baseline is unknown."],
};
const proposal = {
  title: "Air monitor thermal options",
  current: "Baseline unknown",
  unchanged: "3.3 V and I2C",
  items: [
    {
      id: "product",
      name: "Air monitor",
      category: "overview",
      description: "Described product",
      evidenceIds: [],
    },
    {
      id: "sensor",
      name: "Sensor",
      category: "pcb",
      description: "Temperature sensor",
      evidenceIds: ["e1"],
    },
  ],
  links: [
    {
      id: "l1",
      from: "product",
      to: "sensor",
      relation: "contains",
      evidenceIds: [],
    },
  ],
  options: [
    {
      title: "Separate heat sources",
      change: "Evaluate thermal isolation",
      rationale: "Source guidance",
      affectedIds: ["sensor"],
      evidenceIds: ["e1"],
      checks: ["Compare bias against reference thermometer at fixed load."],
    },
  ],
  questions: ["Confirm baseline."],
};
const make = (changes = {}) => {
  const calls = [];
  return {
    key: "test-double-only",
    model: "test-double",
    calls,
    available: async () => ({ id: "test-double" }),
    run: async (a) => {
      calls.push(a.stage);
      if (changes.wait) return changes.wait(a);
      const value =
        a.stage === "Evidence"
          ? structuredClone(evidence)
          : ["Proposal", "Repair"].includes(a.stage)
            ? structuredClone(proposal)
            : {
                passed: !(
                  changes.reject ||
                  (changes.repair && a.stage === "Independent review")
                ),
                issues:
                  changes.reject ||
                  (changes.repair && a.stage === "Independent review")
                    ? ["A reviewer concern."]
                    : [],
              };
      changes.mutate?.(a.stage, value);
      return {
        value,
        model: "test-double",
        usage: { input_tokens: 40, output_tokens: 30 },
      };
    },
  };
};
const prepare = (store) =>
  store.create(input, "unique-test-key-123", "test-double");
test("real PDF bytes are parsed by server, not trusted client text", async () => {
  const bytes = await readFile(
    new URL(
      "../public/examples/bench-conditions.pdf",
      import.meta.url,
    ),
  );
  const p = await normalizeInput({
    objective: input.objective,
    sources: [
      {
        id: "pdf",
        name: "guide.pdf",
        kind: "pdf",
        mime: "application/pdf",
        data: bytes.toString("base64"),
        text: "forged client text",
      },
    ],
  });
  assert.equal(p.sources[0].pageCount, 1);
  assert.match(p.sources[0].pageTexts[0], /airflow/i);
  assert.equal(p.sources[0].sha256.length, 64);
  assert.notEqual(p.sources[0].text, "forged client text");
});
test("immutable idempotency prevents duplicate runs and conflicting input reuse", () => {
  const s = new RunStore(":memory:");
  const a = prepare(s),
    b = prepare(s);
  assert.equal(a.id, b.id);
  assert.throws(
    () =>
      s.create(
        { ...input, objective: "different" },
        "unique-test-key-123",
        "test-double",
      ),
    /different inputs/,
  );
  assert.equal(s.list().length, 1);
});
test("three distinct model stages produce a reviewable draft, with trace and usage", async () => {
  const s = new RunStore(":memory:"),
    r = prepare(s),
    p = make();
  await executeRun(s, r.id, p);
  const result = s.get(r.id);
  assert.equal(result.status, "ready");
  assert.deepEqual(p.calls, ["Evidence", "Proposal", "Independent review"]);
  assert.equal(result.usage.input, 120);
  assert.equal(result.output.proposal.options.length, 1);
  assert.match(result.events.at(-1).message, /No design revision/);
});
test("one repair followed by a fresh review, never an unbounded loop", async () => {
  const s = new RunStore(":memory:"),
    r = prepare(s),
    p = make({ repair: true });
  await executeRun(s, r.id, p);
  assert.equal(s.get(r.id).status, "ready");
  assert.deepEqual(p.calls, [
    "Evidence",
    "Proposal",
    "Independent review",
    "Repair",
    "Final review",
  ]);
});
test("unresolved independent review blocks publication after one repair", async () => {
  const s = new RunStore(":memory:"),
    r = prepare(s),
    p = make({ reject: true });
  await executeRun(s, r.id, p);
  assert.equal(s.get(r.id).status, "failed");
  assert.equal(s.get(r.id).output, undefined);
  assert.equal(p.calls.length, 5);
});
test("fabricated quotes and source IDs cannot reach proposal drafting", async () => {
  for (const field of ["quote", "sourceId"]) {
    const s = new RunStore(":memory:"),
      r = prepare(s),
      p = make({
        mutate: (stage, v) => {
          if (stage === "Evidence") v.evidence[0][field] = "invented";
        },
      });
    await executeRun(s, r.id, p);
    assert.equal(s.get(r.id).status, "failed");
    assert.deepEqual(p.calls, ["Evidence"]);
  }
});
test("functional edges and options require valid evidence references", () => {
  const p = structuredClone(proposal);
  p.links[0].relation = "drives";
  assert.throws(() => verifyProposal(p, evidence), /requires source/);
  p.links[0].evidenceIds = ["e1"];
  p.options[0].evidenceIds = ["missing"];
  assert.throws(() => verifyProposal(p, evidence), /unknown evidence/);
});
test("visual interpretation remains separate from exact quotations", () => {
  const e = structuredClone(evidence);
  e.evidence[0].kind = "visual";
  assert.throws(() => verifyEvidence(e, input.sources), /Visual evidence/);
});
test("provider failure never substitutes a local draft", async () => {
  const s = new RunStore(":memory:"),
    r = prepare(s);
  await executeRun(s, r.id, {
    available: async () => {
      throw new Error("Provider unavailable");
    },
  });
  assert.equal(s.get(r.id).status, "failed");
  assert.equal(s.get(r.id).output, undefined);
});
test("cancellation propagates and retains immutable request", async () => {
  const s = new RunStore(":memory:"),
    r = prepare(s),
    c = new AbortController();
  c.abort(new Error("Cancelled by user."));
  await executeRun(s, r.id, make(), c.signal);
  assert.equal(s.get(r.id).status, "cancelled");
  assert.equal(s.get(r.id).input.objective, input.objective);
});
test("restart marks interrupted work without repeating potentially billed calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "caid-runs-"));
  try {
    const path = join(dir, "runs.sqlite"),
      s = new RunStore(path),
      r = prepare(s);
    s.state(r.id, "running", "Proposal");
    s.db.close();
    const reopened = new RunStore(path);
    reopened.recover();
    assert.equal(reopened.get(r.id).status, "interrupted");
    assert.equal(reopened.get(r.id).inputHash, r.inputHash);
    reopened.feedback(r.id, "Missing airflow constraint", "needs-work");
    assert.equal(
      reopened.db.prepare("SELECT COUNT(*) AS n FROM feedback").get().n,
      1,
    );
    reopened.db.close();
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("Anthropic transport sends actual image blocks and enforces token budget", async () => {
  const requests = [];
  const p = new AnthropicProvider({
    key: "test-double-only",
    fetcher: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(
        JSON.stringify(
          url.endsWith("count_tokens")
            ? { input_tokens: 100 }
            : {
                stop_reason: "end_turn",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      gaps: evidence.gaps,
                      evidence: evidence.evidence.map((e) => ({
                        id: e.id,
                        statement: e.statement,
                        referenceId: evidenceCatalog(input)[0].id,
                      })),
                    }),
                  },
                ],
                usage: { input_tokens: 100, output_tokens: 30 },
                model: "test-double",
              },
        ),
      );
    },
  });
  const picture = {
    id: "image",
    name: "reference.png",
    kind: "image",
    mime: "image/png",
    data: "fixture",
    text: "",
  };
  await p.run({
    input: { ...input, sources: [...input.sources, picture] },
    stage: "Evidence",
    prompt: "Extract",
    schema: (await import("../src/analysis-contract.ts")).EvidenceResult,
    budget: { input: 1000, output: 4096 },
  });
  assert(
    !JSON.stringify(requests[1].body.output_config.format.schema).includes(
      "exclusiveMinimum",
    ),
  );
  assert.equal(
    requests[1].body.messages[0].content.find((b) => b.type === "image").source
      .data,
    "fixture",
  );
  await assert.rejects(
    () =>
      p.run({
        input,
        stage: "Evidence",
        prompt: "Extract",
        schema: null,
        budget: { input: 1, output: 4096 },
      }),
    /budget/,
  );
});
