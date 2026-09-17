"use client";
import type { ChangeContent } from "@/lib/changes/model";
import { Input, Section } from "./ui";
const uid = () => crypto.randomUUID();
type Props = { draft: ChangeContent; edit: (content: ChangeContent) => void };

export function RequirementFields({ draft, edit }: Props) {
  return (
    <Section number="2" title="Measurable requirements">
      {draft.requirements.map((r, i) => (
        <article className="cw-card" key={r.id}>
          <header>
            <strong>Requirement {i + 1}</strong>
            <button
              onClick={() =>
                edit({
                  ...draft,
                  requirements: draft.requirements.filter((x) => x.id !== r.id),
                  evidence: draft.evidence.filter(
                    (e) => e.requirementId !== r.id,
                  ),
                })
              }
            >
              Remove
            </button>
          </header>
          <Input
            label="Requirement"
            value={r.statement}
            onChange={(statement) =>
              edit({
                ...draft,
                requirements: draft.requirements.map((x) =>
                  x.id === r.id ? { ...r, statement } : x,
                ),
              })
            }
          />
          <div className="cw-row">
            <label>
              Comparison
              <select
                value={r.operator}
                onChange={(e) =>
                  edit({
                    ...draft,
                    requirements: draft.requirements.map((x) =>
                      x.id === r.id
                        ? {
                            ...r,
                            operator: e.target.value as ">=" | "<=",
                          }
                        : x,
                    ),
                  })
                }
              >
                <option value=">=">At least ≥</option>
                <option value="<=">At most ≤</option>
              </select>
            </label>
            <Input
              label="Target"
              type="number"
              value={String(r.target)}
              onChange={(v) =>
                edit({
                  ...draft,
                  requirements: draft.requirements.map((x) =>
                    x.id === r.id ? { ...r, target: Number(v) } : x,
                  ),
                })
              }
            />
            <Input
              label="Unit"
              value={r.unit}
              onChange={(unit) =>
                edit({
                  ...draft,
                  requirements: draft.requirements.map((x) =>
                    x.id === r.id ? { ...r, unit } : x,
                  ),
                })
              }
            />
          </div>
          <Input
            label="Operating conditions and acceptance method"
            value={r.conditions}
            multiline
            onChange={(conditions) =>
              edit({
                ...draft,
                requirements: draft.requirements.map((x) =>
                  x.id === r.id ? { ...r, conditions } : x,
                ),
              })
            }
          />
        </article>
      ))}
      <button
        onClick={() =>
          edit({
            ...draft,
            requirements: [
              ...draft.requirements,
              {
                id: uid(),
                statement: "",
                target: 0,
                operator: ">=",
                unit: "",
                conditions: "",
              },
            ],
          })
        }
      >
        + Add requirement
      </button>
    </Section>
  );
}

export function AlternativeFields({ draft, edit }: Props) {
  return (
    <Section number="3" title="Alternatives and selected design">
      {draft.alternatives.map((a, i) => (
        <article className="cw-card" key={a.id}>
          <header>
            <strong>Alternative {i + 1}</strong>
            <button
              onClick={() =>
                edit({
                  ...draft,
                  alternatives: draft.alternatives.filter((x) => x.id !== a.id),
                  selectedAlternative:
                    draft.selectedAlternative === a.id
                      ? ""
                      : draft.selectedAlternative,
                })
              }
            >
              Remove
            </button>
          </header>
          {(["title", "approach", "tradeoffs"] as const).map((key) => (
            <Input
              key={key}
              label={
                key === "title"
                  ? "Name"
                  : key === "approach"
                    ? "Approach and assumptions"
                    : "Tradeoffs and remaining risks"
              }
              value={a[key]}
              multiline={key !== "title"}
              onChange={(v) =>
                edit({
                  ...draft,
                  alternatives: draft.alternatives.map((x) =>
                    x.id === a.id ? { ...a, [key]: v } : x,
                  ),
                })
              }
            />
          ))}
          <h3>Artifact changes</h3>
          {a.artifacts.map((f, j) => (
            <div className="cw-artifact" key={j}>
              {(["id", "before", "after"] as const).map((key) => (
                <Input
                  key={key}
                  label={
                    key === "id"
                      ? "Artifact ID"
                      : key === "before"
                        ? "Baseline value"
                        : "Proposed value"
                  }
                  value={f[key]}
                  onChange={(v) =>
                    edit({
                      ...draft,
                      alternatives: draft.alternatives.map((x) =>
                        x.id === a.id
                          ? {
                              ...a,
                              artifacts: a.artifacts.map((y, k) =>
                                k === j ? { ...f, [key]: v } : y,
                              ),
                            }
                          : x,
                      ),
                    })
                  }
                />
              ))}
              <button
                onClick={() =>
                  edit({
                    ...draft,
                    alternatives: draft.alternatives.map((x) =>
                      x.id === a.id
                        ? {
                            ...a,
                            artifacts: a.artifacts.filter((_, k) => k !== j),
                          }
                        : x,
                    ),
                  })
                }
              >
                Remove artifact
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              edit({
                ...draft,
                alternatives: draft.alternatives.map((x) =>
                  x.id === a.id
                    ? {
                        ...a,
                        artifacts: [
                          ...a.artifacts,
                          { id: "", before: "", after: "" },
                        ],
                      }
                    : x,
                ),
              })
            }
          >
            + Add artifact
          </button>
          <label className="cw-choice">
            <input
              type="radio"
              name="selectedAlternative"
              checked={draft.selectedAlternative === a.id}
              onChange={() => edit({ ...draft, selectedAlternative: a.id })}
            />{" "}
            Select this alternative
          </label>
        </article>
      ))}
      <button
        onClick={() =>
          edit({
            ...draft,
            alternatives: [
              ...draft.alternatives,
              {
                id: uid(),
                title: "",
                approach: "",
                tradeoffs: "",
                artifacts: [],
              },
            ],
          })
        }
      >
        + Add alternative
      </button>
      <Input
        label="Why this alternative? Which tradeoffs are being accepted?"
        multiline
        value={draft.selectionReason}
        onChange={(selectionReason) => edit({ ...draft, selectionReason })}
      />
    </Section>
  );
}

export function EvidenceFields({ draft, edit }: Props) {
  return (
    <Section number="4" title="Evidence and verification">
      <p>
        Record results for the selected alternative. Calculations, simulations,
        and physical tests are distinct. A reference alone cannot pass a
        requirement. Evidence is entered by the author and assessed by
        reviewers.
      </p>
      {draft.evidence.map((e) => (
        <article className="cw-card" key={e.id}>
          <header>
            <strong>Evidence record</strong>
            <button
              onClick={() =>
                edit({
                  ...draft,
                  evidence: draft.evidence.filter((x) => x.id !== e.id),
                })
              }
            >
              Remove
            </button>
          </header>
          <label>
            Requirement
            <select
              value={e.requirementId}
              onChange={(event) =>
                edit({
                  ...draft,
                  evidence: draft.evidence.map((x) =>
                    x.id === e.id
                      ? {
                          ...e,
                          requirementId: event.target.value,
                        }
                      : x,
                  ),
                })
              }
            >
              {draft.requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.statement || "Untitled requirement"}
                </option>
              ))}
            </select>
          </label>
          <div className="cw-row">
            <label>
              Evidence type
              <select
                value={e.kind}
                onChange={(event) =>
                  edit({
                    ...draft,
                    evidence: draft.evidence.map((x) =>
                      x.id === e.id
                        ? {
                            ...e,
                            kind: event.target.value as typeof e.kind,
                          }
                        : x,
                    ),
                  })
                }
              >
                {[
                  "calculation",
                  "simulation",
                  "physical test",
                  "reference",
                ].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <Input
              label={`Result (${draft.requirements.find((r) => r.id === e.requirementId)?.unit || "requirement units"})`}
              type="number"
              value={String(e.result)}
              onChange={(v) =>
                edit({
                  ...draft,
                  evidence: draft.evidence.map((x) =>
                    x.id === e.id ? { ...e, result: Number(v) } : x,
                  ),
                })
              }
            />
          </div>
          {(["source", "method", "limitations"] as const).map((key) => (
            <Input
              key={key}
              label={
                key === "source"
                  ? "Source URL or document ID, revision, and section"
                  : key === "method"
                    ? "Method, operating conditions, and tool version"
                    : "Limitations, uncertainty, and untested conditions"
              }
              value={e[key]}
              multiline
              onChange={(v) =>
                edit({
                  ...draft,
                  evidence: draft.evidence.map((x) =>
                    x.id === e.id ? { ...e, [key]: v } : x,
                  ),
                })
              }
            />
          ))}
        </article>
      ))}
      <button
        disabled={!draft.requirements.length}
        onClick={() =>
          edit({
            ...draft,
            evidence: [
              ...draft.evidence,
              {
                id: uid(),
                requirementId: draft.requirements[0].id,
                kind: "calculation",
                result: 0,
                source: "",
                method: "",
                limitations: "",
              },
            ],
          })
        }
      >
        + Add evidence
      </button>
      <p className="cw-caption">
        Save design edits before adding new evidence. Changing requirements,
        alternatives, or the selection clears existing evidence; every edit
        resets reviews.
      </p>
    </Section>
  );
}
