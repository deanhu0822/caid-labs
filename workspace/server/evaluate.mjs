// Replay exact stored source snapshots. This records evidence; it never promotes a model.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  RunStore,
  AnthropicProvider,
  executeRun,
  VERSION,
} from "./harness.mjs";
const [manifestPath, reportPath] = process.argv.slice(2);
if (!manifestPath || !reportPath)
  throw new Error(
    "Usage: npm run evaluate -- frozen-manifest.json report.json",
  );
const bytes = await readFile(manifestPath),
  manifest = JSON.parse(bytes);
if (
  !Array.isArray(manifest.cases) ||
  manifest.cases.length < 1 ||
  manifest.cases.length > 10
)
  throw new Error("Freeze 1–10 cases in the manifest.");
const provider = new AnthropicProvider();
if (!provider.key)
  throw new Error(
    "Anthropic credentials are required for live replay. No synthetic result will be reported.",
  );
const store = new RunStore("data/analysis.sqlite"),
  results = [];
const prepared=manifest.cases.map(c=>{
  const source = store.get(c.runId);
  if (
    !source ||
    source.inputHash !== c.inputHash ||
    !Array.isArray(c.requiredPhrases) ||
    !Array.isArray(c.forbiddenPhrases)||!c.requiredPhrases.every(p=>typeof p==='string')||!c.forbiddenPhrases.every(p=>typeof p==='string')||!Number.isInteger(c.expectedOptionCount)||c.expectedOptionCount<1||c.expectedOptionCount>4||!Number.isInteger(c.minimumSourceCount)||c.minimumSourceCount<0||c.minimumSourceCount>8
  )
    throw new Error("Case snapshot or frozen checks are invalid.");
  return {c,source};
});
for (const {c,source} of prepared) {
  const run = store.create(
    source.input,
    `eval-${crypto.randomUUID()}`,
    provider.model,
  );
  await executeRun(store, run.id, provider);
  const r = store.get(run.id),
    text = JSON.stringify(r.output ?? {}).toLowerCase();
  results.push({
    sourceRun: c.runId,
    runId: run.id,
    status: r.status,
    inputHash: r.inputHash,
    usage: r.usage,
    requiredPassed: c.requiredPhrases.every((p) =>
      text.includes(p.toLowerCase()),
    ),
    forbiddenPassed: c.forbiddenPhrases.every(
      (p) => !text.includes(p.toLowerCase()),
    ),
    optionCountPassed:r.output?.proposal.options.length===c.expectedOptionCount,
    sourceCoveragePassed:new Set(r.output?.evidence.evidence.map(e=>e.sourceId)??[]).size>=c.minimumSourceCount,
    output:r.output,events:r.events,
    error: r.error,
  });
}
const report = {
  createdAt: new Date().toISOString(),
  manifestHash: createHash("sha256").update(bytes).digest("hex"),
  harnessVersion: VERSION,
  model: provider.model,
  results,
  automatedGatesPassed: results.every(
    (r) => r.status === "ready" && r.requiredPassed && r.forbiddenPassed && r.optionCountPassed && r.sourceCoveragePassed,
  ),
  humanReviewRequired: true,
  promoted: false,
};
await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(
  JSON.stringify({
    reportPath,
    automatedGatesPassed: report.automatedGatesPassed,
    promoted: false,
  }),
);
store.db.close();

if(!report.automatedGatesPassed)process.exitCode=1;
