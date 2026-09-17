/* eslint-disable @typescript-eslint/no-require-imports -- Load the actual TypeScript domain and SQLite store under Node's test runner. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const { ChangeStore } = require("../lib/changes/store.ts");
const { parseContent } = require("../lib/changes/model.ts");
function fixture(t, file = ":memory:") {
  const store = new ChangeStore(file);
  t.after(() => store.db.close());
  const author = store.addUser(
    "Author",
    "author@example.test",
    "author-test-password",
    "owner",
  );
  const reviewer = store.addUser(
    "Electrical reviewer",
    "reviewer@example.test",
    "reviewer-test-password",
  );
  const other = store.addUser(
    "Other",
    "other@example.test",
    "other-test-password",
  );
  const content = {
    title: "Increase payload",
    request:
      "Baseline document rover-C, section 2. Support 10.4 kg at 5 degrees for 30 minutes.",
    requirements: [
      {
        id: "payload",
        statement: "Payload capacity",
        operator: ">=",
        target: 10.4,
        unit: "kg",
        conditions: "5 degree slope; 30 minute duty cycle",
      },
    ],
    alternatives: [
      {
        id: "motor",
        title: "Upgrade motor",
        approach: "Larger motor",
        tradeoffs: "More current and weight",
        artifacts: [{ id: "MOTOR", before: "M1", after: "M2" }],
      },
      {
        id: "keep",
        title: "Keep baseline",
        approach: "Reduce slope",
        tradeoffs: "Does not meet original slope target",
        artifacts: [],
      },
    ],
    selectedAlternative: "motor",
    selectionReason: "Accept higher current after electrical review.",
    evidence: [
      {
        id: "calc",
        requirementId: "payload",
        kind: "calculation",
        result: 11,
        source: "calc-123 revision 1 section 2",
        method: "Static torque model at 5 degrees",
        limitations: "Dynamic loads untested; design review only",
      },
    ],
    reviewerIds: [reviewer.id],
  };
  const create = () => store.create(author, "rover", content);
  const submit = (c) => store.mutate(author, c.id, c.version, "submit", {});
  const approve = (c) =>
    store.mutate(reviewer, c.id, c.version, "review", {
      decision: "approve",
      note: "Reviewed model and current budget; physical tests remain required.",
    });
  return { store, author, reviewer, other, content, create, submit, approve };
}
test("authenticated reviews produce a durable immutable revision with artifact manifest and digest", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forma-workflow-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const db = path.join(dir, "db.sqlite");
  const f = fixture(t, db);
  const c = f.approve(f.submit(f.create()));
  const saved = f.store.mutate(f.author, c.id, c.version, "save", {});
  assert.equal(saved.revision, 1);
  assert.equal(f.store.head("rover"), 1);
  assert.throws(
    () =>
      f.store.mutate(f.author, saved.id, saved.version, "edit", {
        content: f.content,
      }),
    /immutable/,
  );
  const reopened = new ChangeStore(db);
  try {
    assert.equal(reopened.get(c.id).status, "saved");
    const revision = reopened.revisions()[0];
    assert.deepEqual(revision.artifacts, { MOTOR: "M2" });
    assert.equal(
      revision.digest,
      crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            snapshot: revision.snapshot,
            artifacts: revision.artifacts,
          }),
        )
        .digest("hex"),
    );
    assert.equal(reopened.events(c.id).length, 4);
  } finally {
    reopened.db.close();
  }
});
test("missing, failing, or reference-only evidence blocks review", (t) => {
  const f = fixture(t);
  for (const evidence of [
    [],
    [{ ...f.content.evidence[0], result: 9 }],
    [{ ...f.content.evidence[0], kind: "reference" }],
  ]) {
    const c = f.store.create(f.author, "rover", { ...f.content, evidence });
    assert.throws(() => f.submit(c), /payload/i);
    assert.equal(f.store.get(c.id).status, "draft");
  }
});
test("unassigned reviewers, self review, and save without approval are rejected", (t) => {
  const f = fixture(t);
  const c = f.submit(f.create());
  for (const user of [f.author, f.other])
    assert.throws(
      () =>
        f.store.mutate(user, c.id, c.version, "review", {
          decision: "approve",
          note: "ok",
        }),
      /assigned independent/,
    );
  assert.throws(
    () => f.store.mutate(f.author, c.id, c.version, "save", {}),
    /reviews must pass/,
  );
  assert.throws(
    () =>
      f.store.mutate(f.reviewer, c.id, c.version, "edit", {
        content: f.content,
      }),
    /Only the author/,
  );
});
test("stale edits and replays cannot overwrite data or repeat revisions", (t) => {
  const f = fixture(t);
  const original = f.create();
  const submitted = f.submit(original);
  assert.throws(
    () =>
      f.store.mutate(f.author, original.id, original.version, "edit", {
        content: f.content,
      }),
    /updated elsewhere/,
  );
  const approved = f.approve(submitted);
  const saved = f.store.mutate(
    f.author,
    approved.id,
    approved.version,
    "save",
    {},
  );
  assert.throws(
    () => f.store.mutate(f.author, approved.id, approved.version, "save", {}),
    /updated elsewhere/,
  );
  assert.equal(f.store.get(saved.id).status, "saved");
  assert.equal(f.store.revisions().length, 1);
});
test("design edits clear evidence and approvals; re-review required", (t) => {
  const f = fixture(t);
  const c = f.approve(f.submit(f.create()));
  const content = structuredClone(c.content);
  content.alternatives[0].artifacts[0].after = "M3";
  const edited = f.store.mutate(f.author, c.id, c.version, "edit", { content });
  assert.equal(edited.status, "draft");
  assert.deepEqual(edited.content.evidence, []);
  assert.deepEqual(edited.reviews, []);
  assert.throws(
    () => f.store.mutate(f.author, edited.id, edited.version, "save", {}),
    /reviews must pass/,
  );
});
test("concurrent changes cannot advance the same baseline; rebase clears proof and checks artifact before values", (t) => {
  const f = fixture(t);
  const a = f.approve(f.submit(f.create()));
  const b = f.approve(f.submit(f.create()));
  f.store.mutate(f.author, a.id, a.version, "save", {});
  assert.throws(
    () => f.store.mutate(f.author, b.id, b.version, "save", {}),
    /baseline changed/,
  );
  const rebased = f.store.mutate(f.author, b.id, b.version, "rebase", {});
  assert.equal(rebased.baseline, 1);
  assert.deepEqual(rebased.content.evidence, []);
  assert.deepEqual(rebased.reviews, []);
  const updated = f.store.mutate(f.author, b.id, rebased.version, "edit", {
    content: f.content,
  });
  assert.throws(() => f.submit(updated), /baseline value must match/);
});
test("requested changes stop saving and editing invalidates all decisions", (t) => {
  const f = fixture(t);
  const c = f.submit(f.create());
  const rejected = f.store.mutate(f.reviewer, c.id, c.version, "review", {
    decision: "request changes",
    note: "Need thermal calculation.",
  });
  assert.equal(rejected.status, "changes requested");
  assert.throws(
    () => f.store.mutate(f.author, c.id, rejected.version, "save", {}),
    /reviews must pass/,
  );
  const edited = f.store.mutate(f.author, c.id, rejected.version, "edit", {
    content: f.content,
  });
  assert.equal(edited.reviews.length, 0);
});
test("all assigned reviewers must approve the same unchanged design", (t) => {
  const f = fixture(t);
  const created = f.store.create(f.author, "rover", {
    ...f.content,
    reviewerIds: [f.reviewer.id, f.other.id],
  });
  const first = f.approve(f.submit(created));
  assert.throws(
    () => f.store.mutate(f.author, first.id, first.version, "save", {}),
    /reviews must pass/,
  );
  const second = f.store.mutate(f.other, first.id, first.version, "review", {
    decision: "approve",
    note: "Mechanical assumptions reviewed.",
  });
  assert.equal(
    f.store.mutate(f.author, second.id, second.version, "save", {}).status,
    "saved",
  );
});
test("passwords and sessions are hashed, expire, and revoke", (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.store.login(f.author.email, "wrong-password"),
    /incorrect/,
  );
  const token = f.store.login(f.author.email, "author-test-password");
  assert.equal(f.store.user(token).id, f.author.id);
  const stored = f.store.db
    .prepare("SELECT password FROM users WHERE id=?")
    .get(f.author.id).password;
  assert.ok(!stored.includes("author-test-password"));
  assert.notEqual(
    f.store.db.prepare("SELECT token FROM sessions").get().token,
    token,
  );
  f.store.logout(token);
  assert.equal(f.store.user(token), undefined);
  const expired = f.store.login(f.author.email, "author-test-password");
  f.store.db.prepare("UPDATE sessions SET expires=0").run();
  assert.equal(f.store.user(expired), undefined);
});
test("malformed evidence, duplicate IDs, non-finite numbers and invalid reviewers are rejected", (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      parseContent({
        ...f.content,
        requirements: [...f.content.requirements, ...f.content.requirements],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      parseContent({
        ...f.content,
        evidence: [{ ...f.content.evidence[0], requirementId: "unknown" }],
      }),
    /existing requirement/,
  );
  assert.throws(
    () =>
      parseContent({
        ...f.content,
        evidence: [{ ...f.content.evidence[0], result: NaN }],
      }),
    /finite/,
  );
  assert.throws(
    () =>
      f.store.create(f.author, "rover", {
        ...f.content,
        reviewerIds: [f.author.id],
      }),
    /other than the author/,
  );
});
