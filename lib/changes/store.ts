import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  blockers,
  parseContent,
  type Change,
  type Review,
  type Revision,
  type User,
} from "./model";

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const now = () => new Date().toISOString();
type Account = User & { password: string };

export class ChangeStore {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (bucket TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS changes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS heads (product TEXT PRIMARY KEY, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (product TEXT NOT NULL, number INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(product, number));
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, change_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, version INTEGER NOT NULL);
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  users(): User[] {
    return this.db
      .prepare("SELECT id, name, email, role FROM users ORDER BY name")
      .all() as User[];
  }
  addUser(
    name: string,
    email: string,
    password: string,
    role: User["role"] = "reviewer",
  ): User {
    if (
      !name?.trim() ||
      name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 200 ||
      password.length < 12 ||
      password.length > 200
    )
      throw new WorkspaceError(
        "Provide a name, valid email, and a password of 12–200 characters.",
      );
    const salt = randomBytes(16).toString("hex");
    const encoded = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
    };
    if (this.db.prepare("SELECT id FROM users WHERE email=?").get(user.email))
      throw new WorkspaceError("This email already has an account.");
    this.db
      .prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.name, user.email, role, encoded);
    return user;
  }
  throttle(bucket: string) {
    const at = Date.now();
    this.db.prepare("DELETE FROM attempts WHERE start < ?").run(at - 900000);
    this.db
      .prepare(
        "INSERT INTO attempts VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
      )
      .run(bucket, at);
    const row = this.db
      .prepare("SELECT count FROM attempts WHERE bucket=?")
      .get(bucket) as { count: number };
    if (row.count > 30)
      throw new WorkspaceError(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
  }
  login(email: string, password: string) {
    this.throttle("login");
    const account = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase()) as Account | undefined;
    const [salt, expected] = account?.password.split(":") ?? [
      "unregistered-account",
      "00".repeat(64),
    ];
    const valid = timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(expected, "hex"),
    );
    if (!account || !valid)
      throw new WorkspaceError("Email or password is incorrect.", 401);
    const token = randomBytes(32).toString("hex");
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
      .run(hash(token), account.id, Date.now() + 8 * 3600000);
    return token;
  }
  user(token: string): User | undefined {
    return this.db
      .prepare(
        "SELECT u.id,u.name,u.email,u.role FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      )
      .get(hash(token), Date.now()) as User | undefined;
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  }
  head(product: string) {
    return (
      (
        this.db
          .prepare("SELECT revision FROM heads WHERE product=?")
          .get(product) as { revision: number } | undefined
      )?.revision ?? 0
    );
  }
  list(): Change[] {
    return (
      this.db.prepare("SELECT data FROM changes ORDER BY rowid DESC").all() as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data));
  }
  get(id: string): Change {
    const row = this.db
      .prepare("SELECT data FROM changes WHERE id=?")
      .get(id) as { data: string } | undefined;
    if (!row) throw new WorkspaceError("Change not found.", 404);
    return JSON.parse(row.data);
  }
  revisions(): Revision[] {
    return (
      this.db
        .prepare("SELECT data FROM revisions ORDER BY rowid DESC")
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  manifest(product: string): Record<string, string> {
    const row = this.db
      .prepare("SELECT data FROM revisions WHERE product=? AND number=?")
      .get(product, this.head(product)) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Revision).artifacts : {};
  }
  checkBaseline(c: Change) {
    if (c.baseline !== this.head(c.product))
      throw new WorkspaceError(
        "The product baseline changed. Rebase and verify the evidence again.",
        409,
      );
    const manifest = this.manifest(c.product);
    const selected = c.content.alternatives.find(
      (a) => a.id === c.content.selectedAlternative,
    );
    for (const artifact of selected?.artifacts || []) {
      if (
        Object.hasOwn(manifest, artifact.id) &&
        artifact.before !== manifest[artifact.id]
      )
        throw new WorkspaceError(
          `${artifact.id}: baseline value must match the saved value (${manifest[artifact.id]}).`,
        );
    }
  }
  events(id: string) {
    return this.db
      .prepare(
        "SELECT actor,action,at,version FROM events WHERE change_id=? ORDER BY id",
      )
      .all(id);
  }
  write(change: Change, actor: User, action: string) {
    this.db
      .prepare(
        "INSERT INTO changes VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(change.id, JSON.stringify(change));
    this.db
      .prepare(
        "INSERT INTO events(change_id,actor,action,at,version) VALUES (?,?,?,?,?)",
      )
      .run(change.id, actor.id, action, now(), change.version);
    return change;
  }
  create(actor: User, product: string, content: unknown): Change {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(product))
      throw new WorkspaceError(
        "Use a product ID containing letters, numbers, dashes, or underscores.",
      );
    return this.transaction(() => {
      const parsed = parseContent(content);
      this.checkReviewers(parsed.reviewerIds, actor.id);
      const at = now();
      return this.write(
        {
          id: randomUUID(),
          product,
          baseline: this.head(product),
          authorId: actor.id,
          version: 1,
          status: "draft",
          content: parsed,
          reviews: [],
          createdAt: at,
          updatedAt: at,
        },
        actor,
        "created",
      );
    });
  }
  checkReviewers(ids: string[], author: string) {
    const users = this.users();
    if (ids.some((id) => id === author || !users.some((u) => u.id === id)))
      throw new WorkspaceError(
        "Assign existing reviewers other than the author.",
      );
  }
  mutate(
    actor: User,
    id: string,
    version: number,
    action: string,
    payload: Record<string, unknown>,
  ): Change {
    return this.transaction(() => {
      const c = this.get(id);
      if (version !== c.version)
        throw new WorkspaceError(
          "This change was updated elsewhere. Reload before continuing; your unsaved text is still in the editor.",
          409,
        );
      if (c.status === "saved")
        throw new WorkspaceError(
          "Saved revisions are immutable. Start a new change.",
          409,
        );
      if (action !== "review" && actor.id !== c.authorId)
        throw new WorkspaceError(
          "Only the author can edit, submit, rebase, or save this change.",
          403,
        );
      if (action === "edit") {
        const content = parseContent(payload.content);
        this.checkReviewers(content.reviewerIds, c.authorId);
        const design = (v: typeof content) =>
          JSON.stringify([
            v.requirements,
            v.alternatives,
            v.selectedAlternative,
          ]);
        if (design(content) !== design(c.content) && c.content.evidence.length)
          content.evidence = [];
        c.content = content;
        c.reviews = [];
        c.status = "draft";
      } else if (action === "rebase") {
        c.baseline = this.head(c.product);
        c.content.evidence = [];
        c.reviews = [];
        c.status = "draft";
      } else if (action === "submit") {
        const issues = blockers(c);
        if (issues.length) throw new WorkspaceError(issues.join(" "));
        this.checkBaseline(c);
        c.status = "in review";
        c.reviews = [];
      } else if (action === "review") {
        if (
          c.status !== "in review" ||
          !c.content.reviewerIds.includes(actor.id) ||
          c.authorId === actor.id
        )
          throw new WorkspaceError(
            "Only an assigned independent reviewer can review a submitted change.",
            403,
          );
        this.checkBaseline(c);
        if (
          payload.decision !== "approve" &&
          payload.decision !== "request changes"
        )
          throw new WorkspaceError("Choose a review decision.");
        if (
          typeof payload.note !== "string" ||
          !payload.note.trim() ||
          payload.note.length > 4000
        )
          throw new WorkspaceError(
            "Record your review rationale and accepted limitations.",
          );
        const review: Review = {
          userId: actor.id,
          name: actor.name,
          decision: payload.decision,
          note: payload.note.trim(),
          at: now(),
          version: c.version,
        };
        c.reviews = [...c.reviews.filter((r) => r.userId !== actor.id), review];
        if (review.decision === "request changes")
          c.status = "changes requested";
      } else if (action === "save") {
        if (
          c.status !== "in review" ||
          blockers(c).length ||
          !c.content.reviewerIds.every((id) =>
            c.reviews.some((r) => r.userId === id && r.decision === "approve"),
          )
        )
          throw new WorkspaceError(
            "All checks and assigned independent reviews must pass before saving.",
          );
        this.checkBaseline(c);
        c.status = "saved";
        c.revision = c.baseline + 1;
      } else throw new WorkspaceError("Unknown action.");
      c.version += 1;
      c.updatedAt = now();
      if (c.status === "saved") {
        const artifacts = {
          ...this.manifest(c.product),
          ...Object.fromEntries(
            c.content.alternatives
              .find((a) => a.id === c.content.selectedAlternative)!
              .artifacts.map((a) => [a.id, a.after]),
          ),
        };
        const revision: Revision = {
          product: c.product,
          number: c.revision!,
          changeId: c.id,
          at: now(),
          savedBy: actor.id,
          digest: hash(JSON.stringify({ snapshot: c, artifacts })),
          artifacts,
          snapshot: c,
        };
        this.db
          .prepare("INSERT INTO revisions VALUES (?, ?, ?)")
          .run(c.product, c.revision!, JSON.stringify(revision));
        this.db
          .prepare(
            "INSERT INTO heads VALUES (?, ?) ON CONFLICT(product) DO UPDATE SET revision=excluded.revision",
          )
          .run(c.product, c.revision!);
      }
      return this.write(c, actor, action);
    });
  }
}

let singleton: ChangeStore | undefined;
export function workspaceStore() {
  if (
    process.env.VERCEL ||
    (process.env.NODE_ENV === "production" && !process.env.FORMA_CHANGE_DB)
  )
    throw new WorkspaceError(
      "Persistent change storage is not configured. Run this workspace on a Node server with FORMA_CHANGE_DB on a durable volume. The existing sample graph remains available.",
      503,
    );
  return (singleton ??= new ChangeStore(
    process.env.FORMA_CHANGE_DB || `${process.cwd()}/.forma/changes.sqlite`,
  ));
}
