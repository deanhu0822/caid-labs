import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
const dir = await mkdtemp(join(tmpdir(), "forma-http-test-"));
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const setupToken = randomBytes(32).toString("hex");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      VERCEL: "",
      FORMA_CHANGE_DB: join(dir, "test.sqlite"),
      FORMA_CHANGE_SETUP_TOKEN: setupToken,
      FORMA_CHANGE_ORIGIN: origin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (data) => {
    log = (log + data).slice(-8000);
  });
async function call(data, cookie = "", customOrigin = origin) {
  const res = await fetch(`${origin}/api/changes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: customOrigin,
      Cookie: cookie,
    },
    body: JSON.stringify(data),
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch(`${origin}/api/changes`)).ok;
    } catch {
      /* wait for server */
    }
    if (ready) break;
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.ok(ready, `Server failed to start. Build the app first. ${log}`);
  assert.equal((await call({ action: "create" })).status, 401);
  assert.equal(
    (
      await call(
        { action: "login", email: "test@example.test", password: "wrong" },
        "",
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call({
        action: "setup",
        setupToken: "wrong",
        name: "Test author",
        email: "author@example.test",
        password: "author-test-password",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call({
        action: "setup",
        setupToken,
        name: "Test author",
        email: "author@example.test",
        password: "author-test-password",
      })
    ).status,
    200,
  );
  const login = await call({
    action: "login",
    email: "author@example.test",
    password: "author-test-password",
  });
  assert.equal(login.status, 200);
  const reviewer = await call(
    {
      action: "addUser",
      name: "Test electrical reviewer",
      email: "reviewer@example.test",
      password: "reviewer-test-password",
    },
    login.cookie,
  );
  assert.equal(reviewer.status, 201);
  const content = {
    title: "Verification only — payload upgrade",
    request:
      "Test fixture, not engineering evidence. Rover C drawing C-01: target 10.4 kg payload at a 5 degree slope for 30 minutes.",
    requirements: [
      {
        id: "payload",
        statement: "Payload capacity",
        target: 10.4,
        operator: ">=",
        unit: "kg",
        conditions: "5 degree slope; 30 minute duty cycle",
      },
    ],
    alternatives: [
      {
        id: "motor",
        title: "Upgrade motor",
        approach: "Increase motor capacity",
        tradeoffs: "Higher current; 120 g added mass; dynamic loads untested",
        artifacts: [{ id: "MOTOR", before: "M1", after: "M2" }],
      },
      {
        id: "keep",
        title: "Keep baseline",
        approach: "Reduce slope",
        tradeoffs: "Cannot meet requested operating condition",
        artifacts: [],
      },
    ],
    selectedAlternative: "motor",
    selectionReason:
      "Accept current and mass increase for capacity; physical verification still needed.",
    evidence: [
      {
        id: "calc",
        requirementId: "payload",
        kind: "calculation",
        result: 11,
        source: "TEST-FIXTURE calculation C1, revision 1, section 2",
        method: "Synthetic static torque calculation for UI testing",
        limitations: "Synthetic result. Not an actual engineering calculation.",
      },
    ],
    reviewerIds: [reviewer.data.user.id],
  };
  const c = await call(
    { action: "create", product: "verification-rover", content },
    login.cookie,
  );
  assert.equal(c.status, 201);
  assert.equal(
    (
      await call(
        { action: "save", id: c.data.change.id, version: 1 },
        login.cookie,
      )
    ).status,
    400,
  );
  const s = await call(
    { action: "submit", id: c.data.change.id, version: 1 },
    login.cookie,
  );
  assert.equal(s.status, 200);
  assert.equal(
    (
      await call(
        { action: "edit", id: c.data.change.id, version: 1, content },
        login.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        {
          action: "review",
          id: c.data.change.id,
          version: 2,
          decision: "approve",
          note: "Self approval",
        },
        login.cookie,
      )
    ).status,
    403,
  );
  const reviewerLogin = await call({
    action: "login",
    email: "reviewer@example.test",
    password: "reviewer-test-password",
  });
  assert.equal(reviewerLogin.status, 200);
  assert.equal(
    (
      await call(
        {
          action: "addUser",
          name: "Escalation",
          email: "escalation@example.test",
          password: "not-allowed-password",
        },
        reviewerLogin.cookie,
      )
    ).status,
    403,
  );
  const approved = await call(
    {
      action: "review",
      id: c.data.change.id,
      version: 2,
      decision: "approve",
      note: "Synthetic HTTP verification only.",
    },
    reviewerLogin.cookie,
  );
  assert.equal(approved.status, 200);
  const saved = await call(
    {
      action: "save",
      id: c.data.change.id,
      version: approved.data.change.version,
    },
    login.cookie,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.data.change.status, "saved");
  assert.equal(
    (
      await call(
        {
          action: "save",
          id: c.data.change.id,
          version: approved.data.change.version,
        },
        login.cookie,
      )
    ).status,
    409,
  );
  const snapshot = await (
    await fetch(`${origin}/api/changes?id=${c.data.change.id}`, {
      headers: { Cookie: login.cookie },
    })
  ).json();
  assert.equal(snapshot.revisions.length, 1);
  assert.equal(snapshot.revisions[0].artifacts.MOTOR, "M2");
  assert.equal(snapshot.events.length, 4);
  assert.equal(
    (
      await call(
        {
          action: "edit",
          id: c.data.change.id,
          version: saved.data.change.version,
          content,
        },
        login.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        { action: "create", padding: "x".repeat(130000) },
        login.cookie,
      )
    ).status,
    413,
  );
  const logout = await call({ action: "logout" }, login.cookie);
  assert.equal(logout.status, 200);
  assert.equal(
    (await call({ action: "create", product: "rover", content }, login.cookie))
      .status,
    401,
  );
  console.log(
    "HTTP verification passed: initialization, CSRF, sessions, permissions, stale writes, review, immutable save, size limit, and logout.",
  );
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("close", resolve));
  }
  await rm(dir, { recursive: true, force: true });
}
