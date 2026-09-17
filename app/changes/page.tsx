"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  blockers,
  emptyContent,
  evidencePasses,
  type Change,
  type ChangeContent,
  type Revision,
  type User,
} from "@/lib/changes/model";
import "./workspace.css";
import { Input, Section } from "./ui";
import {
  RequirementFields,
  AlternativeFields,
  EvidenceFields,
} from "./design-fields";

type Snapshot = {
  user: User | null;
  needsSetup?: boolean;
  users?: User[];
  changes?: Change[];
  heads?: Record<string, number>;
  revisions?: Revision[];
  events?: { actor: string; action: string; at: string; version: number }[];
};
const field = (event: FormEvent<HTMLFormElement>, name: string) =>
  String(new FormData(event.currentTarget).get(name) || "");
export default function ChangeWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<ChangeContent>(emptyContent);
  const [product, setProduct] = useState("rover-alpha");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [viewVersion, setViewVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newChange, setNewChange] = useState(false);
  const change = snapshot?.changes?.find((c) => c.id === selected);
  const user = snapshot?.user;
  const editable =
    newChange ||
    (!!change && user?.id === change.authorId && change.status !== "saved");

  async function reload(id = selected) {
    const res = await fetch(
      `/api/changes${id ? `?id=${encodeURIComponent(id)}` : ""}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as Snapshot & { error?: string };
    if (!res.ok) throw new Error(data.error || "Workspace request failed.");
    setSnapshot(data);
    return data as Snapshot;
  }
  useEffect(() => {
    async function load() {
      const id = new URLSearchParams(location.search).get("id") || "";
      try {
        const res = await fetch(
          `/api/changes${id ? `?id=${encodeURIComponent(id)}` : ""}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as Snapshot & { error?: string };
        if (!res.ok) throw new Error(data.error || "Workspace request failed.");
        setSnapshot(data);
        setSelected(id);
        setNewChange(false);
        setDirty(false);
        const found = (data as Snapshot).changes?.find((c) => c.id === id);
        if (found) {
          setDraft(found.content);
          setProduct(found.product);
          setViewVersion(found.version);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    void load();
    window.addEventListener("popstate", load);
    return () => window.removeEventListener("popstate", load);
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choose(c?: Change) {
    if (dirty && !window.confirm("Discard unsaved edits?")) return;
    setViewVersion(c?.version || 0);
    setSelected(c?.id || "");
    setDraft(c?.content || emptyContent());
    setProduct(c?.product || "rover-alpha");
    setNewChange(!c);
    setDirty(false);
    setError("");
    setNotice("");
    history.pushState(null, "", c ? `/changes?id=${c.id}` : "/changes");
    if (c) void reload(c.id).catch((e) => setError(e.message));
  }
  function edit(next: ChangeContent) {
    setDraft(next);
    setDirty(true);
    setNotice("");
  }
  async function send(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: change?.id,
          version: viewVersion,
          ...payload,
        }),
      });
      const data = (await res.json()) as { error?: string; change?: Change };
      if (!res.ok) throw new Error(data.error || "Workspace request failed.");
      const c = data.change as Change | undefined;
      if (c) {
        setViewVersion(c.version);
        setSelected(c.id);
        setDraft(c.content);
        setProduct(c.product);
        setDirty(false);
        setNewChange(false);
        history.replaceState(null, "", `/changes?id=${c.id}`);
      }
      if (action === "logout") {
        setSelected("");
        setDraft(emptyContent());
        setDirty(false);
        setNewChange(false);
      }
      const refreshed = await reload(c?.id || selected);
      if (action === "login") {
        const found = refreshed.changes?.find((x) => x.id === selected);
        if (found) {
          setDraft(found.content);
          setProduct(found.product);
          setViewVersion(found.version);
        }
      }
      setNotice(
        action === "save"
          ? "Revision saved with its evidence, reviews, and artifact changes."
          : action === "edit"
            ? "Draft saved. Reviews reset; design edits also clear previous evidence."
            : action === "setup"
              ? "Workspace initialized. Sign in with the account you just created."
              : action === "login" || action === "logout"
                ? ""
                : "Saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const issues = change ? blockers({ ...change, content: draft }) : [];
  const stale =
    !!change &&
    change.baseline !== snapshot?.heads?.[change.product] &&
    change.status !== "saved";
  const option = draft.alternatives.find(
    (a) => a.id === draft.selectedAlternative,
  );
  const revision = snapshot?.revisions?.find((r) => r.changeId === selected);
  const canSave =
    change?.status === "in review" &&
    !issues.length &&
    !stale &&
    change.content.reviewerIds.every((id) =>
      change.reviews.some((r) => r.userId === id && r.decision === "approve"),
    );

  return (
    <main className="cw">
      <header className="cw-top">
        <Link href="/" className="cw-brand">
          forma<span>Engineering changes</span>
        </Link>
        <nav>
          <Link href="/graph">Explore sample graph ↗</Link>
          {user && (
            <>
              <span>{user.name}</span>
              <button
                disabled={busy || dirty}
                onClick={() => void send("logout")}
              >
                Sign out
              </button>
            </>
          )}
        </nav>
      </header>
      <div className="cw-shell">
        <div className="cw-heading">
          <div>
            <p className="cw-eyebrow">ENGINEERING WORKSPACE</p>
            <h1>
              {change
                ? change.content.title
                : "Make the next change reviewable."}
            </h1>
            <p>
              Requirements, tradeoffs, evidence, and accountable decisions in
              one saved record.
            </p>
          </div>
          {user && (
            <button
              className="cw-primary"
              disabled={busy}
              onClick={() => choose()}
            >
              + New change
            </button>
          )}
        </div>
        {error && (
          <div className="cw-alert" role="alert">
            {error}
            <button
              disabled={busy}
              onClick={() => {
                void reload()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message));
              }}
            >
              Reload latest records
            </button>
            <span>
              Your editor text is preserved. Reload the selected change to
              replace it.
            </span>
          </div>
        )}
        {notice && (
          <p className="cw-notice" role="status">
            {notice}
          </p>
        )}
        {!snapshot && !error && <p role="status">Loading workspace…</p>}
        {snapshot && !user && (
          <section className="cw-auth">
            <h2>
              {snapshot.needsSetup
                ? "Set up your workspace"
                : "Sign in to review changes"}
            </h2>
            <p>
              {snapshot.needsSetup
                ? "The server operator supplies a setup token. This creates the first owner account."
                : "Your reviews are recorded against your signed-in account."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(snapshot.needsSetup ? "setup" : "login", {
                  name: field(e, "name"),
                  email: field(e, "email"),
                  password: field(e, "password"),
                  setupToken: field(e, "setupToken"),
                });
              }}
            >
              {snapshot.needsSetup && (
                <>
                  <label>
                    Your name
                    <input
                      name="name"
                      required
                      maxLength={100}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Setup token
                    <input
                      name="setupToken"
                      type="password"
                      required
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={snapshot.needsSetup ? 12 : undefined}
                  maxLength={200}
                  autoComplete={
                    snapshot.needsSetup ? "new-password" : "current-password"
                  }
                />
              </label>
              <button className="cw-primary" disabled={busy}>
                {busy
                  ? "Working…"
                  : snapshot.needsSetup
                    ? "Create owner account"
                    : "Sign in"}
              </button>
            </form>
          </section>
        )}
        {user && (
          <div className="cw-layout">
            <aside className="cw-sidebar">
              <h2>Change register</h2>
              {!snapshot?.changes?.length && (
                <p>
                  No changes yet. Start with a specific request and its
                  operating conditions.
                </p>
              )}
              {snapshot?.changes?.map((c) => (
                <button
                  className={selected === c.id ? "cw-selected" : ""}
                  key={c.id}
                  onClick={() => choose(c)}
                  disabled={busy}
                >
                  <strong>{c.content.title}</strong>
                  <span>
                    {c.product} · {c.status}
                  </span>
                  <small>
                    Baseline {c.baseline}
                    {c.revision ? ` → Revision ${c.revision}` : ""}
                  </small>
                </button>
              ))}
              {user.role === "owner" && (
                <details className="cw-team">
                  <summary>Add a team member</summary>
                  <p>
                    Create an individual reviewer account. Deliver the password
                    privately.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      void send("addUser", {
                        name: field(e, "name"),
                        email: field(e, "email"),
                        password: field(e, "password"),
                      }).then(() => form.reset());
                    }}
                  >
                    <label>
                      Name
                      <input name="name" required />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" required />
                    </label>
                    <label>
                      Initial password
                      <input
                        name="password"
                        type="password"
                        minLength={12}
                        maxLength={200}
                        required
                        autoComplete="new-password"
                      />
                    </label>
                    <button disabled={busy}>Create account</button>
                  </form>
                </details>
              )}
              <p className="cw-caption">
                Saved revisions describe the selected design changes. They do
                not modify CAD, the sample graph, or certify a manufacturing
                release.
              </p>
            </aside>
            <div className="cw-main">
              {!change && !newChange ? (
                <section className="cw-empty">
                  <p className="cw-eyebrow">FROM REQUEST TO SAVED REVISION</p>
                  <h2>Start with what needs to change.</h2>
                  <p>
                    For a higher payload, specify the payload, slope, duty
                    cycle, runtime, and environmental limits. Then compare
                    approaches and attach evidence for each requirement.
                  </p>
                  <ol>
                    <li>Define measurable requirements</li>
                    <li>Compare alternatives and artifact changes</li>
                    <li>Record results and their limitations</li>
                    <li>Assign independent reviews</li>
                    <li>Save an immutable design revision</li>
                  </ol>
                  <button className="cw-primary" onClick={() => choose()}>
                    Create a change request
                  </button>
                </section>
              ) : (
                <>
                  <div className="cw-context">
                    <span>
                      {newChange
                        ? "NEW REQUEST"
                        : `${change?.status.toUpperCase()} · VERSION ${change?.version}`}
                    </span>
                    <span>
                      {product} · Baseline{" "}
                      {change?.baseline ?? snapshot?.heads?.[product] ?? 0}
                    </span>
                    {change && (
                      <button disabled={busy} onClick={() => choose(change)}>
                        Reload selected change
                      </button>
                    )}
                  </div>
                  {change && change.version !== viewVersion && (
                    <p className="cw-alert">
                      This record changed elsewhere. Reload the selected change
                      before taking another action. Unsaved edits have been
                      preserved.
                    </p>
                  )}
                  {change && (
                    <div className="cw-next">
                      <div>
                        <strong>
                          {revision
                            ? "Revision saved"
                            : stale
                              ? "Baseline changed"
                              : dirty
                                ? "Save your edits"
                                : issues.length
                                  ? `${issues.length} items before review`
                                  : change.status === "in review"
                                    ? canSave
                                      ? "Ready to save"
                                      : "Independent review in progress"
                                    : "Ready to submit"}
                        </strong>
                        <p>
                          {revision
                            ? "This record is immutable. Start a new change for further work."
                            : dirty
                              ? "Save the draft before submitting or recording a review."
                              : issues.length
                                ? issues[0]
                                : change.status === "in review"
                                  ? `${change.reviews.filter((r) => r.decision === "approve").length} of ${change.content.reviewerIds.length} reviewers approved. Review the evidence and accepted limitations below.`
                                  : "Submit the saved design for independent review."}
                        </p>
                      </div>
                      <a href="#step-6">View checks and decisions ↓</a>
                    </div>
                  )}
                  <nav className="cw-steps" aria-label="Change workflow">
                    {[
                      "Request",
                      "Requirements",
                      "Alternatives",
                      "Evidence",
                      "Reviews",
                      "Revision",
                    ].map((label, i) => (
                      <a key={label} href={`#step-${i + 1}`}>
                        {i + 1}. {label}
                      </a>
                    ))}
                  </nav>
                  {stale && (
                    <div className="cw-alert">
                      A newer revision exists. Rebase this request and verify it
                      against the new baseline.
                      {editable && (
                        <button
                          disabled={busy || dirty}
                          onClick={() => void send("rebase")}
                        >
                          Rebase and clear evidence / reviews
                        </button>
                      )}
                    </div>
                  )}
                  <fieldset
                    key={`${selected}:${viewVersion}`}
                    className="cw-editor"
                    disabled={!editable || busy}
                  >
                    <Section number="1" title="Request and baseline">
                      <Input
                        label="Change title"
                        value={draft.title}
                        onChange={(title) => edit({ ...draft, title })}
                      />
                      {newChange && (
                        <Input
                          label="Product ID"
                          value={product}
                          onChange={(v) => {
                            setProduct(v);
                            setDirty(true);
                          }}
                        />
                      )}
                      <Input
                        label="Requested outcome, original design reference, and scope"
                        value={draft.request}
                        multiline
                        onChange={(request) => edit({ ...draft, request })}
                      />
                      <p className="cw-caption">
                        Baseline 0 is the starting external design described
                        here. Later baselines reference saved revisions in this
                        workspace.
                      </p>
                    </Section>
                    <RequirementFields draft={draft} edit={edit} />
                    <AlternativeFields draft={draft} edit={edit} />
                    <EvidenceFields draft={draft} edit={edit} />
                    <Section number="5" title="Assigned reviews">
                      <p>
                        Assign people responsible for the affected disciplines.
                        The author cannot approve their own change.
                      </p>
                      {snapshot?.users
                        ?.filter((u) => u.id !== (change?.authorId || user.id))
                        .map((u) => (
                          <label className="cw-choice" key={u.id}>
                            <input
                              type="checkbox"
                              checked={draft.reviewerIds.includes(u.id)}
                              onChange={(e) =>
                                edit({
                                  ...draft,
                                  reviewerIds: e.target.checked
                                    ? [...draft.reviewerIds, u.id]
                                    : draft.reviewerIds.filter(
                                        (id) => id !== u.id,
                                      ),
                                })
                              }
                            />
                            {u.name} · {u.email}
                          </label>
                        ))}
                      {snapshot?.users?.length === 1 && (
                        <p>
                          Add another team member before submitting for review.
                        </p>
                      )}
                    </Section>
                  </fieldset>
                  {editable && (
                    <div className="cw-savebar">
                      <span>
                        {dirty ? "Unsaved edits" : "Draft matches saved record"}
                      </span>
                      <button
                        className="cw-primary"
                        disabled={busy || (!newChange && !dirty)}
                        onClick={() =>
                          void send(newChange ? "create" : "edit", {
                            product,
                            content: draft,
                          })
                        }
                      >
                        {newChange ? "Save request" : "Save draft"}
                      </button>
                      {change && (
                        <button
                          disabled={
                            busy ||
                            dirty ||
                            !!issues.length ||
                            stale ||
                            change.status === "in review"
                          }
                          onClick={() => void send("submit")}
                        >
                          Submit for independent review
                        </button>
                      )}
                    </div>
                  )}
                  {change && (
                    <Section
                      number="6"
                      title={
                        revision
                          ? `Saved revision ${revision.number}`
                          : "Review and save revision"
                      }
                    >
                      <p className="cw-caption">
                        A passing number is a comparison against the entered
                        target, not independent proof. Review the source,
                        method, and uncertainty before approving.
                      </p>
                      <div className="cw-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Requirement</th>
                              <th>Target</th>
                              <th>Evidence and margin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draft.requirements.map((r) => (
                              <tr key={r.id}>
                                <th>
                                  {r.statement}
                                  <small>{r.conditions}</small>
                                </th>
                                <td>
                                  {r.operator} {r.target} {r.unit}
                                </td>
                                <td>
                                  {draft.evidence
                                    .filter((e) => e.requirementId === r.id)
                                    .map((e) => (
                                      <p key={e.id}>
                                        <strong
                                          className={
                                            evidencePasses(r, e)
                                              ? "cw-pass"
                                              : "cw-fail"
                                          }
                                        >
                                          {e.kind === "reference"
                                            ? "Reference only"
                                            : evidencePasses(r, e)
                                              ? "Meets entered target"
                                              : "Fails entered target"}
                                        </strong>
                                        <br />
                                        {e.result} {r.unit} · {e.kind}
                                        {e.kind !== "reference" &&
                                          ` · margin ${Number((r.operator === ">=" ? e.result - r.target : r.target - e.result).toPrecision(5))} ${r.unit}`}
                                        <br />
                                        <small>{e.source}</small>
                                      </p>
                                    ))}
                                  {!draft.evidence.some(
                                    (e) => e.requirementId === r.id,
                                  ) && "No evidence"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {option && (
                        <div className="cw-tradeoff">
                          <strong>Selected: {option.title}</strong>
                          <p>{draft.selectionReason}</p>
                          <p>{option.tradeoffs}</p>
                          {option.artifacts.map((a) => (
                            <p key={a.id}>
                              <strong>{a.id}</strong>: {a.before} → {a.after}
                            </p>
                          ))}
                        </div>
                      )}
                      {!!issues.length && (
                        <div className="cw-blockers">
                          <h3>Before review</h3>
                          <ul>
                            {issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <h3>Review decisions</h3>
                      {change.content.reviewerIds.map((id) => {
                        const review = change.reviews.find(
                          (r) => r.userId === id,
                        );
                        return (
                          <article className="cw-card" key={id}>
                            <strong>
                              {snapshot?.users?.find((u) => u.id === id)?.name}{" "}
                              · {review?.decision || "Pending"}
                            </strong>
                            {review && (
                              <>
                                <p>{review.note}</p>
                                <small>
                                  {new Date(review.at).toLocaleString()} ·
                                  reviewed record version {review.version}
                                </small>
                              </>
                            )}
                          </article>
                        );
                      })}
                      {change.status === "in review" &&
                        change.content.reviewerIds.includes(user.id) && (
                          <form
                            className="cw-review-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void send("review", {
                                decision: field(e, "decision"),
                                note: field(e, "note"),
                              });
                            }}
                          >
                            <label>
                              Decision
                              <select name="decision">
                                <option value="request changes">
                                  Request changes
                                </option>
                                <option value="approve">
                                  Approve this design revision
                                </option>
                              </select>
                            </label>
                            <label>
                              Rationale, checked sources, and accepted
                              limitations
                              <textarea name="note" required maxLength={4000} />
                            </label>
                            <button className="cw-primary" disabled={busy}>
                              Record my review
                            </button>
                          </form>
                        )}
                      {editable && (
                        <button
                          className="cw-primary"
                          disabled={busy || dirty || !canSave}
                          onClick={() => void send("save")}
                        >
                          Save reviewed revision
                        </button>
                      )}
                      {revision && (
                        <>
                          <p>
                            Immutable snapshot · saved{" "}
                            {new Date(revision.at).toLocaleString()}
                          </p>
                          <p className="cw-digest">
                            SHA-256: {revision.digest}
                          </p>
                          <button
                            onClick={() => {
                              const url = URL.createObjectURL(
                                new Blob([JSON.stringify(revision, null, 2)], {
                                  type: "application/json",
                                }),
                              );
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = `${product}-revision-${revision.number}.json`;
                              link.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            Export revision and evidence
                          </button>
                        </>
                      )}
                      <details className="cw-history">
                        <summary>Activity history</summary>
                        {snapshot?.events?.map((event, i) => (
                          <p key={i}>
                            {
                              snapshot.users?.find((u) => u.id === event.actor)
                                ?.name
                            }{" "}
                            · {event.action} · v{event.version} ·{" "}
                            {new Date(event.at).toLocaleString()}
                          </p>
                        ))}
                      </details>
                    </Section>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
