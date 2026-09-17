import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { workspaceStore, WorkspaceError } from "@/lib/changes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "forma_changes_session";
const response = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
function failure(error: unknown) {
  if (error instanceof WorkspaceError)
    return response({ error: error.message }, error.status);
  console.error("Change workspace request failed:", error);
  return response(
    {
      error:
        "The workspace could not complete this request. No partial revision was saved.",
    },
    500,
  );
}
export async function GET(request: NextRequest) {
  try {
    const store = workspaceStore();
    const user = store.user(request.cookies.get(cookieName)?.value || "");
    if (!user)
      return response({ user: null, needsSetup: store.users().length === 0 });
    const id = request.nextUrl.searchParams.get("id");
    const changes = store.list();
    return response({
      user,
      users: store.users(),
      changes,
      heads: Object.fromEntries(
        changes.map((c) => [c.product, store.head(c.product)]),
      ),
      revisions: store.revisions(),
      ...(id ? { events: store.events(id) } : {}),
    });
  } catch (error) {
    return failure(error);
  }
}
async function body(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new WorkspaceError("Send JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkspaceError("Missing request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 128000) {
      await reader.cancel();
      throw new WorkspaceError("Change exceeds the 128 KB limit.", 413);
    }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new WorkspaceError("Invalid JSON request.");
  }
}
export async function POST(request: NextRequest) {
  try {
    const expectedOrigin =
      process.env.FORMA_CHANGE_ORIGIN || request.nextUrl.origin;
    if (request.headers.get("origin") !== expectedOrigin)
      throw new WorkspaceError(
        "Request origin does not match the workspace.",
        403,
      );
    const data = await body(request);
    const store = workspaceStore();
    const token = request.cookies.get(cookieName)?.value || "";
    const text = (name: string, max = 4000) => {
      const value = data[name];
      if (typeof value !== "string" || value.length > max)
        throw new WorkspaceError(`Invalid ${name}.`);
      return value;
    };
    if (data.action === "setup") {
      store.throttle("setup");
      const configured = process.env.FORMA_CHANGE_SETUP_TOKEN;
      const digest = (value: string) =>
        createHash("sha256").update(value).digest();
      if (
        !configured ||
        configured.length < 32 ||
        !timingSafeEqual(digest(text("setupToken")), digest(configured))
      )
        throw new WorkspaceError(
          "Workspace setup needs the setup token configured by the operator.",
          403,
        );
      const name = text("name", 100),
        email = text("email", 200),
        password = text("password", 200);
      store.transaction(() => {
        if (store.users().length)
          throw new WorkspaceError(
            "This workspace is already initialized.",
            409,
          );
        store.addUser(name, email, password, "owner");
      });
      return response({ ok: true });
    }
    if (data.action === "login") {
      const session = store.login(text("email", 200), text("password", 200));
      const result = response({ ok: true });
      result.cookies.set(cookieName, session, {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(expectedOrigin).protocol === "https:",
        path: "/api/changes",
        maxAge: 8 * 3600,
      });
      return result;
    }
    const user = store.user(token);
    if (!user)
      throw new WorkspaceError("Sign in to access the change workspace.", 401);
    if (data.action === "logout") {
      store.logout(token);
      const result = response({ ok: true });
      result.cookies.set(cookieName, "", { path: "/api/changes", maxAge: 0 });
      return result;
    }
    if (data.action === "addUser") {
      if (user.role !== "owner")
        throw new WorkspaceError(
          "Only the workspace owner can add reviewers.",
          403,
        );
      return response(
        {
          user: store.addUser(
            text("name", 100),
            text("email", 200),
            text("password", 200),
          ),
        },
        201,
      );
    }
    try {
      if (data.action === "create")
        return response(
          { change: store.create(user, text("product", 80), data.content) },
          201,
        );
      if (!Number.isSafeInteger(data.version) || Number(data.version) < 1)
        throw new WorkspaceError("A valid record version is required.");
      return response({
        change: store.mutate(
          user,
          text("id", 80),
          Number(data.version),
          text("action", 30),
          data,
        ),
      });
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if (error instanceof Error && !("code" in error))
        throw new WorkspaceError(error.message);
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
