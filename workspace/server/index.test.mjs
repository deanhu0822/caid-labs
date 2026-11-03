import { test, before, after } from "node:test";
import { request } from "node:http";
import assert from "node:assert/strict";
import { createApp } from "./index.mjs";
import { RunStore, AnthropicProvider } from "./harness.mjs";
let app;
const url = "http://127.0.0.1:8798";
before(async () => {
  app = createApp({
    port: 8798,
    verifyIdentity: async (header) => { const userId = /^Bearer (alice|bob|mallory)$/.exec(header || "")?.[1]; if (!userId) throw new Error("Invalid session"); return { userId }; },
    store: new RunStore(":memory:"),
    provider: new AnthropicProvider({ key: "" }),
  });
  await new Promise((resolve, reject) => {
    // Fail promptly when the local port is unavailable or binding is prohibited.
    app.server.once("error", reject);
    app.server.listen(8798, "127.0.0.1", () => {
      app.server.removeListener("error", reject);
      resolve();
    });
  });
}, { timeout: 5000 });
after(() => {
  app.stop();
  app.store.db.close();
});
test("unconfigured live requests fail visibly, without sample fallback", async () => {
  const r = await fetch(url + "/api/analysis/runs", { method: "POST" });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /No demo result/);
  assert.equal(app.store.list().length, 0);
});
test("status exposes configuration and model, never credentials", async () => {
  const r = await (await fetch(url + "/api/analysis/status")).json();
  assert.equal(r.configured, false);
  assert.equal(r.scope, "local-single-user");
  assert.equal("key" in r, false);
});
test("host rebinding and hostile or malformed origins are rejected", async () => {
  for (const headers of [
    { host: "attacker.test" },
    { origin: "https://attacker.test" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.equal(
      await new Promise((resolve, reject) => {
        const r = request(
          url + "/api/analysis/runs",
          { headers },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        r.on("error", reject);
        r.end();
      }),
      403,
      JSON.stringify(headers),
    );
  assert.equal((await fetch(url + "/api/analysis/status")).status, 200);
});
test("unknown runs do not disclose other data", async () =>
  assert.equal((await fetch(url + "/api/analysis/runs/unknown")).status, 404));

test("authenticated workspace API isolates users and detects conflicting edits", async () => {
  const call = (path, user, method = "GET", payload) => fetch(url + path, {
    method, headers: { ...(user ? { authorization: `Bearer ${user}` } : {}), "content-type": "application/json" },
    ...(payload ? {body:JSON.stringify(payload)} : {}),
  });
  assert.equal((await call('/api/workspaces',null)).status,401);
  const created = await call('/api/workspaces','alice','POST',{name:'Hardware'});
  assert.equal(created.status,201);
  const {id} = await created.json();
  assert.equal((await call(`/api/workspaces/${id}/records`,'mallory')).status,403);
  assert.equal((await call(`/api/workspaces/${id}/members`,'alice','POST',{userId:'bob',role:'editor'})).status,201);
  assert.equal((await call(`/api/workspaces/${id}/records/review`,'alice','PUT',{payload:{title:'Sensor'},version:0})).status,200);
  assert.equal((await (await call(`/api/workspaces/${id}/records`,'bob')).json())[0].payload.title,'Sensor');
  assert.equal((await call(`/api/workspaces/${id}/records/review`,'bob','PUT',{payload:{title:'Stale'},version:0})).status,409);
});
