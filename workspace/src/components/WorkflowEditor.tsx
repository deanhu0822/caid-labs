import { useState } from "react";
import {
  emptyWorkflow,
  reviewProblem,
  reviseWorkflow,
  type Workflow,
} from "../workflow";
export function WorkflowEditor({
  value = emptyWorkflow(),
  onChange,
  team = false,
  evidenceReady = true,
}: {
  value?: Workflow;
  onChange: (w: Workflow) => void;
  team?: boolean;
  evidenceReady?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const edit = (patch: Partial<Workflow>) => {
    setError("");
    onChange(reviseWorkflow(value, patch));
  };
  const field = (
    key:
      | "target"
      | "baseline"
      | "current"
      | "proposed"
      | "unchanged"
      | "owner"
      | "reviewer",
    label: string,
    multi = false,
  ) => (
    <label className="context-field" key={key}>
      {label}
      {multi ? (
        <textarea
          rows={key === "proposed" && team ? 14 : 3}
          value={value[key] ?? ""}
          onChange={(e) => edit({ [key]: e.target.value })}
        />
      ) : (
        <input
          value={value[key] ?? ""}
          onChange={(e) => edit({ [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <div className="workflow-editor">
      <div className="context-grid">
        {field("target", "Target part or system")}
        {field("baseline", "Baseline revision")}
      </div>
      <div className="context-grid comparison-fields">
        {field("current", "Current design", true)}
        {field("proposed", "What changes?", true)}
      </div>
      {field("unchanged", "What stays unchanged?", true)}
      {team && (
        <details className="team-details">
          <summary>
            Review coordination · {value.status} ·{" "}
            {value.comments.filter((c) => !c.resolved).length} open comments
          </summary>
          <p className="quiet-note">
            Local coordination record. Names do not send invitations or
            authenticate approvals.
          </p>
          <div className="context-grid">
            {field("owner", "Owner")}
            {field("reviewer", "Reviewer")}
          </div>
          <label className="context-field">
            Review status
            <select
              value={value.status}
              onChange={(e) => {
                const status = e.target.value as Workflow["status"];
                const problem =
                  status === "Reviewed"
                    ? reviewProblem(value) ||
                      (!evidenceReady
                        ? "Link a supporting source to the target and add its purpose."
                        : "")
                    : "";
                setError(problem);
                if (!problem) onChange({ ...value, status });
              }}
            >
              {["Draft", "In review", "Changes requested", "Reviewed"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <p className="quiet-note">
            Editing the proposal or evidence returns the record to Draft.
          </p>
          {value.comments.map((c) => (
            <label className="comment-row" key={c.id}>
              <input
                type="checkbox"
                checked={c.resolved}
                onChange={(e) =>
                  edit({
                    comments: value.comments.map((i) =>
                      i.id === c.id ? { ...i, resolved: e.target.checked } : i,
                    ),
                  })
                }
              />
              <span>
                {c.text} <small>{c.resolved ? "Resolved" : "Open"}</small>
              </span>
            </label>
          ))}
          <label className="context-field">
            New comment
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!comment.trim()}
            onClick={() => {
              edit({
                comments: [
                  ...value.comments,
                  {
                    id: crypto.randomUUID(),
                    text: comment.trim(),
                    resolved: false,
                  },
                ],
              });
              setComment("");
            }}
          >
            Add comment
          </button>
        </details>
      )}
    </div>
  );
}
export function PartsEditor({
  value,
  onChange,
  connections = false,
}: {
  value: Workflow;
  onChange: (w: Workflow) => void;
  connections?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [relation, setRelation] = useState("");
  const edit = (patch: Partial<Workflow>) =>
    onChange(reviseWorkflow(value, patch));
  return (
    <section className="parts-editor">
      <h2>{connections ? "Connections" : "Parts"}</h2>
      {connections ? (
        <>
          <p className="section-description">
            Inspect suggested relationships and record confirmed connections.
          </p>
          {value.links.map((l) => (
            <div className="connection-record" key={l.id}>
              <span>
                {value.items.find((i) => i.id === l.from)?.name} →{" "}
                <strong>{l.relation}</strong> →{" "}
                {value.items.find((i) => i.id === l.to)?.name} ·{" "}
                {l.basis === "inferred"
                  ? "Unconfirmed suggestion"
                  : "User supplied"}
              </span>
              <button
                className="text-button"
                onClick={() =>
                  edit({ links: value.links.filter((i) => i.id !== l.id) })
                }
              >
                Remove connection
              </button>
            </div>
          ))}
          <div className="context-grid">
            {(["From part", "To part"] as const).map((label, index) => (
              <label className="context-field" key={label}>
                {label}
                <select
                  value={index ? to : from}
                  onChange={(e) =>
                    index ? setTo(e.target.value) : setFrom(e.target.value)
                  }
                >
                  <option value="">Choose part</option>
                  {value.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name || "Unnamed part"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="context-field">
            Relationship
            <input
              placeholder="powers, contains, mounts to…"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!from || !to || from === to || !relation.trim()}
            onClick={() => {
              edit({
                links: [
                  ...value.links,
                  {
                    id: crypto.randomUUID(),
                    from,
                    to,
                    relation: relation.trim(),
                  },
                ],
              });
              setRelation("");
            }}
          >
            Add connection
          </button>
        </>
      ) : (
        <>
          <label className="context-field">
            Find a part
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, revision or description"
            />
          </label>
          <div className="table-scroll">
            <table className="change-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Revision</th>
                  <th>Purpose / specification</th>
                  <th>Request target</th>
                </tr>
              </thead>
              <tbody>
                {value.items
                  .filter((i) =>
                    `${i.name} ${i.revision} ${i.description}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((i, n) => (
                    <tr key={i.id}>
                      {(["name", "revision", "description"] as const).map(
                        (k) => (
                          <td key={k}>
                            <input
                              className="context-input"
                              aria-label={`Part ${n + 1} ${k}`}
                              value={i[k]}
                              onChange={(e) =>
                                edit({
                                  items: value.items.map((p) =>
                                    p.id === i.id
                                      ? { ...p, [k]: e.target.value }
                                      : p,
                                  ),
                                })
                              }
                            />
                          </td>
                        ),
                      )}
                      <td>
                        <button
                          className="text-button"
                          disabled={!i.name.trim()}
                          onClick={() =>
                            edit({ target: i.name, baseline: i.revision })
                          }
                        >
                          Use as target
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!value.items.length && (
            <p className="empty-note">
              Add only the parts relevant to your objective.
            </p>
          )}
          <button
            className="secondary-button"
            onClick={() =>
              edit({
                items: [
                  ...value.items,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    revision: "",
                    description: "",
                  },
                ],
              })
            }
          >
            Add part
          </button>
        </>
      )}
    </section>
  );
}
