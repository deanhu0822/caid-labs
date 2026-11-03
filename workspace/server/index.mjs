import { createServer } from "node:http";
import { WorkspaceStore } from "./workspaces.mjs";
import { createIdentityVerifier } from "./identity.mjs";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RunStore,
  AnthropicProvider,
  normalizeInput,
  executeRun,
  MODEL,
  VERSION,
} from "./harness.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export function createApp({
  store = new RunStore(resolve(root, "data/analysis.sqlite")),
  provider = new AnthropicProvider(),
  port = 5173,
  verifyIdentity = process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY ? createIdentityVerifier({url:process.env.SUPABASE_URL,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY}) : null,
} = {}) {
  store.recover();
  const workspaces = new WorkspaceStore(store.db);
  const controllers = new Map(),
    queue = [];
  let active = false;
  const pump = async () => {
    if (active) return;
    const id = queue.shift();
    if (!id) return;
    active = true;
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      await executeRun(store, id, provider, controller.signal);
    } finally {
      controllers.delete(id);
      active = false;
      void pump();
    }
  };
  const publicRun = (r) =>
    r
      ? {
          id: r.id,
          status: r.status,
          stage: r.stage,
          model: r.model,
          harnessVersion: r.harnessVersion,
          inputHash: r.inputHash,
          error: r.error,
          output: r.output,
          events: r.events,
          usage: r.usage,
        }
      : null;
  const server = createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    const hosts = new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      "127.0.0.1:5173",
      "localhost:5173",
    ]);
    let originAllowed = true;
    try {
      if (req.headers.origin)
        originAllowed = hosts.has(new URL(req.headers.origin).host);
    } catch {
      originAllowed = false;
    }
    if (
      !hosts.has(req.headers.host) ||
      !originAllowed ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(403, {
        error: "This server accepts same-origin local workspace requests only.",
      });
    try {
      const path = new URL(req.url, "http://127.0.0.1").pathname;
      if (path === "/api/analysis/status" && req.method === "GET")
        return send(200, {
          configured: !!provider.key,
          model: provider.model || MODEL,
          harnessVersion: VERSION,
          scope: "local-single-user",
        });
      if (path === "/api/analysis/runs" && req.method === "GET")
        return send(200, store.list());
      const match = path.match(
        /^\/api\/analysis\/runs\/([\w-]+)(?:\/(cancel|feedback))?$/,
      );
      if (match && req.method === "GET") {
        const r = store.get(match[1]);
        return send(
          r ? 200 : 404,
          r ? publicRun(r) : { error: "Run not found." },
        );
      }
      const body = async () => {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 36 * 1024 * 1024)
            throw new Error("Analysis request is too large.");
          chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      };
      if (path === "/api/workspaces" || path.startsWith("/api/workspaces/")) {
        if (!verifyIdentity) return send(503, {error:"Team sign-in is not configured."});
        let identity;
        try { identity = await verifyIdentity(req.headers.authorization); }
        catch (error) { return send(error.message === "Identity verification unavailable" ? 503 : 401, {error:"Sign in to access your workspace."}); }
        const workspaceRoute = path.match(/^\/api\/workspaces\/([\w-]+)(?:\/(members|records)(?:\/([\w-]+))?)?$/);
        try {
          if (path === "/api/workspaces" && req.method === "GET") return send(200,workspaces.listForUser(identity.userId));
          if (path === "/api/workspaces" && req.method === "POST") return send(201,workspaces.create(identity.userId,(await body()).name));
          if (workspaceRoute && workspaceRoute[2] === "members" && req.method === "POST") {
            const b=await body(); workspaces.addMember(workspaceRoute[1],identity.userId,b.userId,b.role); return send(201,{added:true});
          }
          if (workspaceRoute && workspaceRoute[2] === "records" && !workspaceRoute[3] && req.method === "GET") return send(200,workspaces.list(workspaceRoute[1],identity.userId));
          if (workspaceRoute && workspaceRoute[2] === "records" && workspaceRoute[3] && req.method === "PUT") {
            const b=await body(); return send(200,{version:workspaces.put(workspaceRoute[1],identity.userId,workspaceRoute[3],b.payload,b.version)});
          }
          return send(404,{error:"Not found."});
        } catch (error) {
          if (error.message === "Workspace access denied") return send(403,{error:"Workspace access denied."});
          if (error.message === "Record version conflict") return send(409,{error:"This record changed. Reload before saving."});
          return send(400,{error:"Workspace request could not be completed."});
        }
      }
      if (path === "/api/analysis/runs" && req.method === "POST") {
        if (!provider.key)
          return send(503, {
            error:
              "Anthropic is not connected. Your objective and files are retained. No demo result was substituted.",
          });
        const key = req.headers["idempotency-key"];
        if (typeof key !== "string" || !/^[-\w]{16,100}$/.test(key))
          return send(400, { error: "A valid request identity is required." });
        if (queue.length >= 3)
          return send(429, { error: "Analysis queue is full. Retry later." });
        const input = await normalizeInput(await body());
        const run = store.create(input, key, provider.model);
        if (
          run.status === "queued" &&
          !queue.includes(run.id) &&
          !controllers.has(run.id)
        ) {
          queue.push(run.id);
          void pump();
        }
        return send(202, publicRun(run));
      }
      if (match && req.method === "POST") {
        const r = store.get(match[1]);
        if (!r) return send(404, { error: "Run not found." });
        if (match[2] === "cancel") {
          controllers.get(r.id)?.abort(new Error("Cancelled by user."));
          if (r.status === "queued")
            store.state(r.id, "cancelled", "Cancelled", "Cancelled by user.");
          return send(200, publicRun(store.get(r.id)));
        }
        if (match[2] === "feedback") {
          const b = await body();
          if (
            !["useful", "needs-work"].includes(b.verdict) ||
            typeof b.note !== "string" ||
            !b.note.trim() ||
            b.note.length > 4000
          )
            return send(400, {
              error: "Add a feedback note and valid verdict.",
            });
          store.feedback(r.id, b.note, b.verdict);
          return send(200, { saved: true });
        }
      }
      if (path.startsWith("/api/")) return send(404, { error: "Not found." });
      if (req.method !== "GET")
        return send(405, { error: "Method not allowed." });
      const base = resolve(root, "dist"),
        requested = resolve(base, "." + path);
      if (!requested.startsWith(base + sep) && requested !== base)
        return send(404, { error: "Not found." });
      const file = extname(requested) ? requested : resolve(base, "index.html");
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        return send(404, {
          error: "Build the app before starting the production server.",
        });
      }
      const mime =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        }[extname(file)] || "application/octet-stream";
      res.writeHead(200, {
        "content-type": mime,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      });
      res.end(bytes);
    } catch (error) {
      send(400, {
        error:
          error instanceof Error
            ? error.message
            : "The request could not be handled.",
      });
    }
  });
  return {
    server,
    store,
    stop: () => {
      for (const c of controllers.values())
        c.abort(new Error("Server stopping."));
      server.close();
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.CAID_PORT || 5173);
  const app = createApp({ port });
  app.server.listen(port, "127.0.0.1", () =>
    console.log(`CAID analysis server: http://127.0.0.1:${port}`),
  );
  process.on("SIGTERM", app.stop);
  process.on("SIGINT", app.stop);
}
