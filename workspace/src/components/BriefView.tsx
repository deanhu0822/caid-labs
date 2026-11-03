import { useEffect, useState } from "react";
import { readRun, feedback } from "../analysis-client";
import type { RunResult } from "../analysis-contract";
import { WorkflowEditor, PartsEditor } from "./WorkflowEditor";
import { emptyWorkflow } from "../workflow";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Download,
  FileCheck2,
  Check,
  ArrowUpRight,
} from "lucide-react";
import type { Brief } from "../domain";
import { exportMarkdown } from "../domain";
import { SourceCard } from "./Sources";
import { CsvTable } from "./CsvTable";

export function downloadBrief(brief: Brief) {
  const url = URL.createObjectURL(
    new Blob([exportMarkdown(brief)], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    brief.title
      .replace(/[^\p{L}\p{N} -]/gu, "")
      .trim()
      .slice(0, 70) || "brief"
  }.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BriefView({
  brief,
  onFiles,
  busy,
  errors,
  onChange,
  onSource,
  onBack,
  onDelete,
}: {
  brief: Brief;
  onFiles: (files: File[]) => void;
  busy: boolean;
  errors: string[];
  onChange: (brief: Brief) => void;
  onSource: (id: string, page?: number) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const change = (patch: Partial<Brief>) =>
    onChange({
      ...brief,
      ...patch,
      workflow:
        patch.workflow ??
        (brief.workflow ? { ...brief.workflow, status: "Draft" } : undefined),
      updatedAt: new Date().toISOString(),
    });
  return (
    <div className="brief-page">
      <fieldset className="review-fields" disabled={busy}>
        <div className="brief-topline">
          <button className="text-button" onClick={onBack}>
            <ArrowLeft size={16} />
            Workspace
          </button>
          <button
            className="secondary-button"
            onClick={() => downloadBrief(brief)}
          >
            <Download size={16} />
            Export review
          </button>
        </div>
        <div className="brief-heading">
          <span className="eyebrow">
            <FileCheck2 size={15} /> SAVED REQUEST
          </span>
          <textarea
            rows={2}
            aria-label="Review title"
            className="title-input"
            placeholder="Untitled review"
            maxLength={120}
            value={brief.title}
            onChange={(event) => change({ title: event.target.value })}
          />
          <p>
            {brief.analysis
              ? "Drafted with Anthropic from your objective and sources. Review the evidence before making a change."
              : brief.generation ||
                "Your inputs, organized for review. Everything here is editable."}
          </p>
        </div>
        {brief.analysis && <AnalysisDetails runId={brief.analysis.runId} />}
        {errors.length > 0 && (
          <p role="alert" className="error-text">
            {errors.join(" ")}
          </p>
        )}
        <div className="brief-grid">
          <div className="brief-main">
            <WorkflowEditor
              value={brief.workflow}
              team
              evidenceReady={brief.sources.some(
                (s) =>
                  s.status !== "error" &&
                  !!s.appliesTo?.trim() &&
                  !!s.note.trim(),
              )}
              onChange={(workflow) => change({ workflow })}
            />
            <details className="scope-details">
              <summary>Parts and connections in this request</summary>
              <PartsEditor
                value={brief.workflow ?? emptyWorkflow()}
                onChange={(workflow) => change({ workflow })}
              />
              <PartsEditor
                connections
                value={brief.workflow ?? emptyWorkflow()}
                onChange={(workflow) => change({ workflow })}
              />
            </details>

            <details className="scope-details">
              <summary>Original objective</summary>
              <textarea
                aria-label="Your request"
                className="request-field"
                rows={4}
                value={brief.request}
                onChange={(event) => change({ request: event.target.value })}
              />
            </details>
            <section className="brief-section">
              <div className="section-heading">
                <h2>Evidence and notes</h2>
                <span className="section-number">02</span>
              </div>
              <p className="section-description">
                Your notes stay linked to the original files.
              </p>
              {brief.sources
                .filter((source) => source.kind === "csv" && source.text)
                .map((source) => (
                  <div className="brief-table" key={source.id}>
                    <button
                      className="table-source"
                      onClick={() => onSource(source.id)}
                    >
                      {source.name}
                      <ArrowUpRight size={13} />
                    </button>
                    <CsvTable text={source.text} compact />
                  </div>
                ))}
              <div className="observations">
                {brief.observations.map((observation, index) => {
                  const source = brief.sources.find(
                    (item) => item.id === observation.sourceId,
                  );
                  return (
                    <div className="observation" key={observation.id}>
                      <span className="observation-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <textarea
                          aria-label={`Source note ${index + 1}`}
                          rows={2}
                          value={observation.text}
                          onChange={(event) =>
                            change({
                              observations: brief.observations.map((item) =>
                                item.id === observation.id
                                  ? { ...item, text: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                        {observation.quote && (
                          <details className="source-excerpt">
                            <summary>View exact source excerpt</summary>
                            <blockquote className="evidence-quote">
                              {observation.quote}
                            </blockquote>
                          </details>
                        )}
                        {source ? (
                          <button
                            className="citation"
                            onClick={() =>
                              onSource(source.id, observation.page)
                            }
                          >
                            {brief.analysis
                              ? `${observation.id} · `
                              : observation.text.trim() &&
                                  source.text.includes(observation.text.trim())
                                ? ""
                                : brief.generation &&
                                    /^(Candidate evidence|Demo recipe reference|Evidence gap|Option|Supporting reference|Image text reference)/.test(
                                      observation.text,
                                    )
                                  ? "Draft reference · "
                                  : "Your note · "}
                            {source.name}
                            {observation.page
                              ? ` · p. ${observation.page}`
                              : ""}
                            <ArrowUpRight size={12} />
                          </button>
                        ) : (
                          <span className="own-note">Your note</span>
                        )}
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Remove source note ${index + 1}`}
                        onClick={() =>
                          change({
                            observations: brief.observations.filter(
                              (item) => item.id !== observation.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {!brief.observations.length && (
                <p className="empty-note">
                  Open a source to inspect it, then add what matters here.
                </p>
              )}
              <button
                className="text-button add-note"
                onClick={() =>
                  change({
                    observations: [
                      ...brief.observations,
                      { id: crypto.randomUUID(), text: "" },
                    ],
                  })
                }
              >
                <Plus size={15} />
                Add a note
              </button>
            </section>
            <section className="brief-section">
              <div className="section-heading">
                <h2>Next steps</h2>
                <span className="section-number">03</span>
              </div>
              <div className="steps">
                {brief.nextSteps.map((step, index) => (
                  <div
                    className={`step ${step.done ? "step-done" : ""}`}
                    key={step.id}
                  >
                    <button
                      role="checkbox"
                      aria-checked={step.done}
                      className="step-check"
                      aria-label={`Mark step ${index + 1} ${step.done ? "incomplete" : "complete"}`}
                      onClick={() =>
                        change({
                          nextSteps: brief.nextSteps.map((item) =>
                            item.id === step.id
                              ? { ...item, done: !item.done }
                              : item,
                          ),
                        })
                      }
                    >
                      {step.done && <Check size={13} />}
                    </button>
                    <input
                      aria-label={`Next step ${index + 1}`}
                      value={step.text}
                      onChange={(event) =>
                        change({
                          nextSteps: brief.nextSteps.map((item) =>
                            item.id === step.id
                              ? { ...item, text: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label={`Remove next step ${index + 1}`}
                      onClick={() =>
                        change({
                          nextSteps: brief.nextSteps.filter(
                            (item) => item.id !== step.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="text-button add-note"
                onClick={() =>
                  change({
                    nextSteps: [
                      ...brief.nextSteps,
                      { id: crypto.randomUUID(), text: "", done: false },
                    ],
                  })
                }
              >
                <Plus size={15} />
                Add a step
              </button>
            </section>
          </div>
          <aside className="brief-sources">
            <div className="section-heading">
              <h2>Sources</h2>
              <span className="count">{brief.sources.length}</span>
            </div>
            <p>Open a source to inspect evidence or update its note.</p>
            <label className="secondary-button attach-review">
              {busy ? "Reading files…" : "Add supporting files"}
              <input
                aria-label="Add supporting files"
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.csv"
                disabled={busy || brief.sources.length >= 8}
                onChange={(e) => {
                  onFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
            <div className="source-list">
              {brief.sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onOpen={() => onSource(source.id)}
                />
              ))}
            </div>
            {!brief.sources.length && (
              <p className="empty-note">
                This review starts with your request.
              </p>
            )}
          </aside>
        </div>
        <div className="brief-bottom">
          <span>Saved reviews are available in this browser.</span>
          <button className="text-button danger-button" onClick={onDelete}>
            <Trash2 size={14} />
            Delete review
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function AnalysisDetails({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunResult | null>(null),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true;
    void readRun(runId)
      .then((r) => {
        if (current) setRun(r);
      })
      .catch(() => {
        if (current) setMessage("Run record is unavailable.");
      });
    return () => {
      current = false;
    };
  }, [runId]);
  return (
    <details className="scope-details">
      <summary>Analysis record and feedback</summary>
      {run && (
        <>
          <p className="section-description">
            {run.model} · {run.harnessVersion} · {run.stage} ·{" "}
            {run.usage?.input ?? 0} input tokens · {run.usage?.output ?? 0}{" "}
            output tokens
          </p>
          <p className="section-description">Run {run.id}</p>
          <ol className="analysis-events">
            {run.events
              ?.filter((e) => e.message !== "Started")
              .map((e, i) => (
                <li key={i}>
                  <strong>{e.stage}</strong>
                  <span>{e.message}</span>
                </li>
              ))}
          </ol>
        </>
      )}
      <label className="context-field">
        What should improve?
        <textarea
          value={note}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Describe a missing constraint, incorrect claim, or useful result."
        />
      </label>
      <button
        className="secondary-button"
        disabled={!note.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await feedback(runId, note, "needs-work");
            setMessage(
              "Feedback saved for evaluation. It does not change the live model.",
            );
            setNote("");
          } catch {
            setMessage("Feedback could not be saved. Please retry.");
          } finally {
            setSaving(false);
          }
        }}
      >
        Save feedback
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
