import {
  analysisStatus,
  analysisFingerprint,
  startAnalysis,
  readRun,
  cancelRun,
  briefFromRun,
} from "./analysis-client";
import { generateProposal } from "./proposal";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  GitBranch,
  Layers2,
  LoaderCircle,
  Menu,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import type { Brief, Draft, Source } from "./domain";
import { draftForArtifact, replaceBriefSource } from "./domain";
import {
  commitBrief,
  deleteBrief,
  listBriefs,
  loadDraft,
  saveBrief,
  saveDraft,
} from "./storage";
import { ACCEPT, MAX_FILES, importFile, readImageText } from "./inputs";
import { partsForRevision, neighbors, type Revision } from "./rover";
import { ProductGraph } from "./components/ProductGraph";
import { SampleChange } from "./components/SampleChange";
import { SourceCard, SourceDialog } from "./components/Sources";
import { BriefView } from "./components/BriefView";
import { WorkflowEditor, PartsEditor } from "./components/WorkflowEditor";
import { emptyWorkflow } from "./workflow";
import { Dialog } from "./components/Dialog";

const AssemblyGraph = lazy(() =>
  import("./components/AssemblyGraph").then((m) => ({
    default: m.AssemblyGraph,
  })),
);

const EMPTY_DRAFT: Draft = { request: "", sources: [] };
// The hosted preview has no authenticated analysis service yet. Never imply
// that its browser-only drafting is the live Anthropic workflow.
const HOSTED_PREVIEW = import.meta.env.VITE_CAID_HOSTED_PREVIEW === "1";
type SaveState = "loading" | "saving" | "saved" | "error";

export default function App() {
  const [sourcePage, setSourcePage] = useState<number | undefined>();
  const openSource = (id: string, page?: number) => {
    setSourcePage(page);
    setSourceId(id);
  };
  const draftingAbort = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [connection, setConnection] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState(false);
  useEffect(() => {
    if (HOSTED_PREVIEW) return;
    void analysisStatus()
      .then(setConnection)
      .catch(() => setConnection(null));
    try {
      setPendingAnalysis(!!localStorage.getItem("caid-pending-analysis"));
    } catch {}
  }, []);
  const [dragging, setDragging] = useState(false);
  const [about, setAbout] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Brief | null>(null);
  const [selectedPart, setSelectedPart] = useState("motor");
  const [example, setExample] = useState(false);
  const [view, setView] = useState("Dashboard");
  const [graphId, setGraphId] = useState<string | null>(null);
  const workflow = draft.workflow ?? emptyWorkflow();
  const [sampleOpen, setSampleOpen] = useState(false);
  const [revision, setRevision] = useState<Revision>(() => {
    try {
      return localStorage.getItem("caid-rover-revision") === "D" ? "D" : "C";
    } catch {
      return "C";
    }
  });
  const parts = partsForRevision(revision);
  const part = parts.find((item) => item.id === selectedPart)!;
  const related = neighbors(selectedPart);
  function applyRevision(next: Revision) {
    try {
      localStorage.setItem("caid-rover-revision", next);
      setRevision(next);
      setSampleOpen(false);
    } catch {
      setErrors(["The example revision could not be saved. Please try again."]);
    }
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestInput = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const dragDepth = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveVersion = useRef(0);
  const failedSaves = useRef(new Map<string, () => Promise<void>>());
  const initialDraft = useRef(true);
  const activeBrief = briefs.find((brief) => brief.id === activeId);
  const graphBrief = briefs.find((b) => b.id === graphId) ?? briefs[0];
  const sources =
    activeBrief?.sources ??
    (view === "Product graph" && !example ? graphBrief?.sources : undefined) ??
    draft.sources;
  const selectedSource = sources.find((source) => source.id === sourceId);

  useEffect(() => {
    let current = true;
    Promise.all([listBriefs(), loadDraft()])
      .then(([stored, savedDraft]) => {
        if (!current) return;
        setBriefs(stored);
        setDraft(savedDraft ?? EMPTY_DRAFT);
        setSaveState("saved");
        setReady(true);
      })
      .catch(() => {
        if (!current) return;
        setSaveState("error");
        setErrors([
          "Local storage could not be opened. Your saved work has not been changed. Reload to try again.",
        ]);
      });
    return () => {
      current = false;
    };
  }, []);

  function persist(operation: () => Promise<void>, key = "draft") {
    const version = ++saveVersion.current;
    setSaveState("saving");
    const next = saveQueue.current.catch(() => undefined).then(operation);
    saveQueue.current = next;
    next
      .then(() => {
        failedSaves.current.delete(key);
        if (version === saveVersion.current)
          setSaveState(failedSaves.current.size ? "error" : "saved");
      })
      .catch(() => {
        failedSaves.current.set(key, operation);
        if (version === saveVersion.current) setSaveState("error");
        setErrors((previous) => [
          ...new Set([
            ...previous,
            "Your latest changes could not be saved. Keep this tab open and export any review you need.",
          ]),
        ]);
      });
    return next;
  }

  function retrySaves() {
    for (const [key, operation] of failedSaves.current)
      void persist(operation, key);
  }

  useEffect(() => {
    if (!ready) return;
    if (initialDraft.current) {
      initialDraft.current = false;
      return;
    }
    // Queue writes in order so a slower file save cannot overwrite a newer draft.
    persist(() => saveDraft(draft));
  }, [draft, ready]);

  function updateBrief(brief: Brief) {
    setBriefs((previous) =>
      previous.map((item) => (item.id === brief.id ? brief : item)),
    );
    void persist(() => saveBrief(brief), `brief:${brief.id}`);
  }

  function updateSource(source: Source) {
    if (activeBrief) updateBrief(replaceBriefSource(activeBrief, source));
    else
      setDraft((previous) => ({
        ...previous,
        sources: previous.sources.map((item) =>
          item.id === source.id ? source : item,
        ),
      }));
  }

  async function addFiles(files: File[]) {
    if (!files.length || busyRef.current || !ready) return;
    busyRef.current = true;
    setBusy("Reading files");
    setErrors([]);
    try {
      const available =
        MAX_FILES - (activeBrief?.sources.length ?? draft.sources.length);
      const incoming = files.slice(0, Math.max(0, available));
      if (incoming.length < files.length)
        setErrors([
          `You can attach up to ${MAX_FILES} files. Remove a source before adding more.`,
        ]);
      const imported = await Promise.all(incoming.map(importFile));
      const failed = imported.filter((source) => source.status === "error");
      const accepted = imported.filter((source) => source.status !== "error");
      if (failed.length)
        setErrors((previous) => [
          ...previous,
          ...failed.map(
            (source) =>
              `${source.name}: ${source.error || "This file could not be read."}`,
          ),
        ]);
      if (accepted.length && activeBrief) {
        updateBrief({
          ...activeBrief,
          sources: [...activeBrief.sources, ...accepted],
          workflow: activeBrief.workflow
            ? { ...activeBrief.workflow, status: "Draft" }
            : undefined,
          updatedAt: new Date().toISOString(),
        });
      } else if (accepted.length)
        setDraft((previous) => ({
          ...previous,
          sources: [...previous.sources, ...accepted],
        }));
    } catch {
      setErrors((previous) => [
        ...previous,
        "A file could not be read. Try adding it again.",
      ]);
    } finally {
      busyRef.current = false;
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function prepareBrief(mode: "live" | "local" = "live") {
    if (busyRef.current || !draft.request.trim() || !ready) return;
    busyRef.current = true;
    setBusy("Saving review");
    const controller = new AbortController();
    draftingAbort.current = controller;
    setErrors([]);
    let committing = false;
    try {
      const sources: Source[] = [];
      for (const source of draft.sources) {
        if (
          mode === "local" &&
          source.kind === "image" &&
          !source.text.trim()
        ) {
          setBusy(`Reading image text: ${source.name}`);
          sources.push(
            await readImageText(
              source,
              (p) => setBusy(`Reading image text: ${Math.round(p * 100)}%`),
              controller.signal,
            ),
          );
          if (controller.signal.aborted) return;
        } else sources.push(source);
      }
      setBusy("Drafting proposal");
      let brief: Brief;
      if (mode === "local") brief = generateProposal({ ...draft, sources });
      else {
        const fingerprint = analysisFingerprint({...draft,sources});
        const saved = JSON.parse(
          localStorage.getItem("caid-pending-analysis") || "null",
        ) as { key: string; fingerprint: string; id?: string } | null;
        const pending =
          saved?.fingerprint === fingerprint
            ? saved
            : { key: crypto.randomUUID(), fingerprint };
        localStorage.setItem("caid-pending-analysis", JSON.stringify(pending));
        setPendingAnalysis(true);
        let run = pending.id
          ? await readRun(pending.id)
          : await startAnalysis({ ...draft, sources }, pending.key);
        pending.id = run.id;
        localStorage.setItem("caid-pending-analysis", JSON.stringify(pending));
        setRunId(run.id);
        while (["running", "queued"].includes(run.status)) {
          setBusy(run.stage);
          if (controller.signal.aborted) {
            await cancelRun(run.id);
            throw new Error("Analysis cancelled. Your inputs are retained.");
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          run = await readRun(run.id);
        }
        if (run.status !== "ready") {
          localStorage.removeItem("caid-pending-analysis");
          setPendingAnalysis(false);
          throw new Error(
            run.error || "Analysis needs attention. Your inputs are retained.",
          );
        }
        brief = briefFromRun({ ...draft, sources }, run);
      }
      controller.signal.throwIfAborted();
      await saveQueue.current.catch(() => undefined);
      committing = true;
      setSaveState("saving");
      await commitBrief(brief);
      setBriefs((previous) => [brief, ...previous]);
      setActiveId(brief.id);
      failedSaves.current.delete("draft");
      setSaveState(failedSaves.current.size ? "error" : "saved");
      setDraft(EMPTY_DRAFT);
      if (mode === "live") {
        localStorage.removeItem("caid-pending-analysis");
        setPendingAnalysis(false);
      }
    } catch (error) {
      if (committing) setSaveState("error");
      setErrors([
        error instanceof Error
          ? error.message
          : "Analysis could not finish. Your request and attachments are still here.",
      ]);
    } finally {
      setRunId(null);
      draftingAbort.current = null;
      busyRef.current = false;
      setBusy("");
    }
  }

  function openWorkspace() {
    if (busyRef.current) return;
    setActiveId(null);
    setSourceId(null);
    setSidebarOpen(false);
  }

  async function removeBrief() {
    if (!deleteTarget) return;
    try {
      await saveQueue.current.catch(() => undefined);
      await deleteBrief(deleteTarget.id);
      failedSaves.current.delete(`brief:${deleteTarget.id}`);
      setSaveState(failedSaves.current.size ? "error" : "saved");
      setBriefs((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
      if (activeId === deleteTarget.id) setActiveId(null);
      setDeleteTarget(null);
    } catch {
      setErrors(["The review could not be deleted. Please try again."]);
    }
  }

  const isDraftEmpty = !draft.request.trim() && !draft.sources.length;
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            openWorkspace();
            setView("Dashboard");
            setExample(false);
          }}
          aria-label="CAID workspace"
        >
          <Layers2 className="brand-mark" size={23} />
          caid<span className="brand-period">.</span>
        </button>
        <div className="project-breadcrumb">
          <span>Workspace</span>
          <ChevronRight size={13} />
          <strong>{example ? "Rover example" : "Engineering workspace"}</strong>
        </div>
        <div className="topbar-right">
          <span
            role="status"
            className={`save-state ${saveState === "error" ? "save-error" : ""}`}
          >
            {saveState === "saved" ? (
              <Check size={12} />
            ) : (
              <LoaderCircle
                size={12}
                className={saveState === "error" ? "" : "spinning"}
              />
            )}
            {saveState === "saved"
              ? "Saved locally"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "error"
                  ? "Not saved"
                  : "Opening…"}
          </span>
          <button className="demo-badge" onClick={() => setAbout(true)}>
            {HOSTED_PREVIEW ? "Browser preview" : "Local workspace"}
          </button>
{view!=="Product graph"&&(          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={19} />
          </button>)}
        </div>
      </header>
      {errors.length > 0 && (
        <div className="error-banner" role="alert">
          <div>
            {errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
            {saveState === "error" && failedSaves.current.size > 0 && (
              <button className="text-button" onClick={retrySaves}>
                Retry saving
              </button>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setErrors([])}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {view === "Product graph" ? (
        <Suspense
          fallback={<p className="loading-state">Opening product graph…</p>}
        >
          <AssemblyGraph
            key={example ? "sample" : (graphBrief?.id ?? "empty")}
            sample={example}
            workflow={graphBrief?.workflow ?? workflow}
            sources={example ? [] : (graphBrief?.sources ?? draft.sources)}
            onSource={openSource}
            onBack={() => {
              setView("Dashboard");
              setExample(false);
              setSourceId(null);
            }}
            onChange={(w) => {
              if (graphBrief) updateBrief({ ...graphBrief, workflow: w });
            }}
            onPropose={(name) => {
              setDraft((d) =>
                draftForArtifact(d, example ? undefined : graphBrief, name),
              );
              setView("Objective");
              setExample(false);
            }}
          />
        </Suspense>
      ) : (
        <div
          className={`workspace-grid ${example ? "" : "objective-workspace"} ${view === "Dashboard" ? "dashboard-layout" : ""}`}
        >
          <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
            <button
              className="part-link"
              onClick={() => {
                setExample(false);
                setView("Objective");
                setSidebarOpen(false);
              }}
            >
              Your objective
            </button>
            <button
              className="part-link"
              onClick={() => {
                setExample(false);
                setView("Dashboard");
                setSidebarOpen(false);
              }}
            >
              Dashboard
            </button>
            <div className="sidebar-section-label review-nav-label">
              SAVED REVIEWS <span>{briefs.length}</span>
            </div>
            <nav className="brief-navigation" aria-label="Saved reviews">
              {briefs.length ? (
                briefs.map((brief) => (
                  <button
                    key={brief.id}
                    className="brief-link"
                    disabled={!!busy}
                    onClick={() => {
                      setActiveId(brief.id);
                      setSourceId(null);
                      setSidebarOpen(false);
                    }}
                  >
                    <FileText size={14} />
                    <span>{brief.title || "Untitled review"}</span>
                  </button>
                ))
              ) : (
                <p className="sidebar-empty">
                  Your saved requests and sources appear here.
                </p>
              )}
            </nav>
            <button className="sidebar-help" onClick={() => setAbout(true)}>
              <CircleHelp size={15} />
              About this workspace
            </button>
          </aside>
          <main className="workspace-main">
            {view === "Dashboard" ? (
              <section className="dashboard">
                <span className="overline">YOUR WORKSPACE</span>
                <h1>From objective to reviewed change.</h1>
                <p>
                  Bring your product description, images and documents. Keep the
                  evidence and decisions together.
                </p>
                {HOSTED_PREVIEW && (
                  <p role="status">
                    Browser preview: drafts and files stay in this browser. Live
                    AI analysis and shared team access are not connected yet.
                  </p>
                )}
                <button
                  className="primary-button"
                  onClick={() => setView("Objective")}
                >
                  <Plus size={16} /> New objective
                </button>
                {pendingAnalysis && (
                  <button
                    className="secondary-button"
                    onClick={() => setView("Objective")}
                  >
                    Resume saved analysis
                  </button>
                )}
                <div className="dashboard-cards">
                  <article>
                    <GitBranch size={24} />
                    <h2>Product graph</h2>
                    <p>
                      Explore artifacts and dependencies. Focus a component to
                      inspect its context.
                    </p>
                    {briefs.length > 0 && (
                      <label>
                        Product context
                        <select
                          aria-label="Product context"
                          value={graphBrief?.id ?? ""}
                          onChange={(e) => setGraphId(e.target.value)}
                        >
                          {briefs
                            .filter((b) => b.workflow?.items.length)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.workflow?.items[0]?.name || b.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <button
                      className="secondary-button"
                      disabled={!graphBrief?.workflow?.items.length}
                      onClick={() => {
                        setExample(false);
                        setView("Product graph");
                      }}
                    >
                      Open product graph
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setExample(true);
                        setView("Product graph");
                      }}
                    >
                      View CAID reference example
                    </button>
                  </article>
                  <article>
                    <FileText size={24} />
                    <h2>Change reviews</h2>
                    <p>
                      Review proposed changes, source evidence, open questions
                      and decisions.
                    </p>
                    <span className="dashboard-count">{briefs.length}</span>
                    <p>saved in this workspace</p>
                    {briefs[0] && (
                      <button
                        className="secondary-button"
                        onClick={() => setActiveId(briefs[0].id)}
                      >
                        Continue latest review
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </article>
                </div>
              </section>
            ) : (
              !example && (
                <>
                  <div
                    className="workspace-tabs"
                    role="tablist"
                    aria-label="Workspace views"
                  >
                    {["Objective", "Parts", "Connections"].map((v) => (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={view === v}
                        onClick={() => setView(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {view !== "Objective" && (
                    <PartsEditor
                      value={workflow}
                      connections={view === "Connections"}
                      onChange={(w) => setDraft((d) => ({ ...d, workflow: w }))}
                    />
                  )}
                </>
              )
            )}
            {example && (
              <>
                <ProductGraph
                  parts={parts}
                  selected={selectedPart}
                  onSelect={setSelectedPart}
                  revision={revision}
                />
                <div className="revision-strip">
                  <span>
                    <GitBranch size={16} />
                    <strong>Rev {revision}</strong>
                    <span>
                      {revision === "C"
                        ? "Current sample"
                        : "Example change applied"}
                    </span>
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setSampleOpen(true)}
                  >
                    {revision === "C"
                      ? "Preview example change"
                      : "View example change"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
          </main>
          <aside
            className="inspector"
            aria-label="Part inspector and change request"
          >
            {example && (
              <section className="part-details">
                <div className="inspector-heading">
                  <span className="overline">PART DETAILS</span>
                  <span className="tag">{part.category}</span>
                </div>
                <h1>{part.label}</h1>
                <p className="part-code">{part.code}</p>
                <dl>
                  {part.details.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <details className="connections-details">
                  <summary>
                    Connected parts <span>{related.length}</span>
                  </summary>
                  <div>
                    {related.map((id) => (
                      <button
                        className="connection-link"
                        key={id}
                        onClick={() => setSelectedPart(id)}
                      >
                        {parts.find((p) => p.id === id)!.label}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                </details>
                <button
                  className="text-button"
                  onClick={() => {
                    setDraft((d) => ({
                      ...d,
                      workflow: {
                        ...(d.workflow ?? emptyWorkflow()),
                        target: part.label,
                        baseline: `Example Rev ${revision}`,
                        status: "Draft",
                      },
                    }));
                    setExample(false);
                    setView("Objective");
                  }}
                >
                  Use this part as target
                </button>
              </section>
            )}
            <section
              className={`composer ${!example && view !== "Objective" ? "composer-hidden" : ""} ${dragging ? "composer-dragging" : ""}`}
              aria-label="Change request"
              onDragEnter={(event) => {
                if (event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                  dragDepth.current++;
                  setDragging(true);
                }
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files"))
                  event.preventDefault();
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (--dragDepth.current <= 0) {
                  dragDepth.current = 0;
                  setDragging(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                void addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <label className="composer-label" htmlFor="request">
                {example
                  ? "What would you like to change?"
                  : "What are you trying to achieve?"}
              </label>
              <textarea
                id="request"
                ref={requestInput}
                className="composer-input"
                placeholder="Describe the goal and what should stay the same…"
                value={draft.request}
                rows={4}
                disabled={!!busy || !ready}
                maxLength={12000}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    request: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void prepareBrief(HOSTED_PREVIEW ? "local" : "live");
                  }
                }}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.files);
                  if (files.length) {
                    event.preventDefault();
                    void addFiles(files);
                  }
                }}
              />
              <details className="scope-details">
                <summary>
                  Target and change details
                  {workflow.target ? ` · ${workflow.target}` : ""}
                </summary>
                <WorkflowEditor
                  value={workflow}
                  onChange={(w) => setDraft((d) => ({ ...d, workflow: w }))}
                />
              </details>
              <div className="attachment-grid">
                {draft.sources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    disabled={!!busy}
                    onOpen={() => openSource(source.id)}
                    onRemove={() =>
                      setDraft((previous) => ({
                        ...previous,
                        sources: previous.sources.filter(
                          (item) => item.id !== source.id,
                        ),
                        workflow: previous.workflow
                          ? {
                              ...previous.workflow,
                              items: previous.workflow.items.map((item) => ({
                                ...item,
                                sourceIds: item.sourceIds?.filter(
                                  (id) => id !== source.id,
                                ),
                              })),
                            }
                          : undefined,
                      }))
                    }
                  />
                ))}
              </div>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                multiple
                accept={ACCEPT}
                aria-label="Attach supporting files"
                disabled={!!busy || !ready}
                onChange={(event) =>
                  void addFiles(Array.from(event.target.files || []))
                }
              />
              <button
                className="attach-button"
                disabled={!!busy || !ready || draft.sources.length >= MAX_FILES}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={16} />
                {dragging ? "Drop files here" : "Attach files"}
                <span>
                  {draft.sources.length ? (
                    `${draft.sources.length} / ${MAX_FILES}`
                  ) : (
                    <Plus size={14} />
                  )}
                </span>
              </button>
              <p className="input-hint">
                Images, PDF, text or CSV · drop or paste here
                <br />
                {HOSTED_PREVIEW
                  ? "Up to 8 files · 10 MB each"
                  : "Up to 8 files · images 5 MB, other files 10 MB · 24 MB total for analysis"}
              </p>
              <button
                className="primary-button review-button"
                disabled={
                  isDraftEmpty ||
                  !draft.request.trim() ||
                  !!busy ||
                  !ready ||
                  (!HOSTED_PREVIEW && !connection?.configured)
                }
                onClick={() => void prepareBrief(HOSTED_PREVIEW ? "local" : "live")}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spinning" />
                    {busy}
                  </>
                ) : (
                  <>
                    {HOSTED_PREVIEW ? "Draft from source text" : "Generate proposal"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
              {busy && draftingAbort.current && (
                <button
                  className="text-button"
                  onClick={() => {
                    draftingAbort.current?.abort();
                    if (runId) void cancelRun(runId);
                  }}
                >
                  Cancel drafting
                </button>
              )}
              <p className="composer-footnote">
                {HOSTED_PREVIEW
                  ? "This preview reads source text in your browser. It does not analyze images visually or use a generative model."
                  : connection?.configured
                  ? `Anthropic · ${connection.model}. Original attachments are sent for analysis. Drafts require human review.`
                  : "Anthropic is not connected. Your objective and attachments are saved locally."}
              </p>
              {!HOSTED_PREVIEW && !connection?.configured && (
                <button
                  className="text-button"
                  onClick={() =>
                    void analysisStatus()
                      .then(setConnection)
                      .catch(() =>
                        setErrors(["The analysis server is unavailable."]),
                      )
                  }
                >
                  Check connection
                </button>
              )}
              {pendingAnalysis && (
                <button
                  className="secondary-button"
                  disabled={!!busy}
                  onClick={() => void prepareBrief("live")}
                >
                  Resume analysis
                </button>
              )}
              {!HOSTED_PREVIEW && <details className="scope-details">
                <summary>Local reference draft</summary>
                <p className="composer-footnote">
                  Extracts relevant text without a model. This does not perform
                  visual or engineering analysis.
                </p>
                <button
                  className="secondary-button"
                  disabled={!draft.request.trim() || !!busy || !ready}
                  onClick={() => void prepareBrief("local")}
                >
                  Draft from source text
                </button>
              </details>}
            </section>
          </aside>
        </div>
      )}
      {activeBrief && (
        <Dialog
          title="Saved review"
          onClose={() => {
            if (!busy) openWorkspace();
          }}
          wide
        >
          <BriefView
            busy={!!busy}
            errors={errors}
            onFiles={(files) => void addFiles(files)}
            brief={activeBrief}
            onChange={updateBrief}
            onSource={openSource}
            onBack={openWorkspace}
            onDelete={() => setDeleteTarget(activeBrief)}
          />
        </Dialog>
      )}
      {selectedSource && (
        <SourceDialog
          key={selectedSource.id}
          source={selectedSource}
          initialPage={sourcePage}
          onChange={updateSource}
          onClose={() => setSourceId(null)}
        />
      )}
      {sampleOpen && (
        <SampleChange
          revision={revision}
          onApply={applyRevision}
          onClose={() => setSampleOpen(false)}
        />
      )}
      {about && (
        <Dialog title="About this workspace" onClose={() => setAbout(false)}>
          <div className="about-content">
            <p>
              An objective-led workspace for requests, parts, evidence and
              review. The optional rover illustrates the recorded change
              workflow.
            </p>
            <dl>
              <div>
                <dt>Live analysis</dt>
                <dd>
                  {HOSTED_PREVIEW
                    ? "Live AI analysis is not connected in this browser preview. Drafting uses source text and does not visually interpret images."
                    : "Anthropic analyzes your objective and original attachments in bounded evidence, proposal and independent review stages. Drafts remain editable and require human judgment."}
                </dd>
              </div>
              <div>
                <dt>Example change</dt>
                <dd>
                  The rover and its Rev C → D change use fixed illustrative
                  data. Your attached files do not change those sample values.
                  This reference example does not represent a live engineering
                  run.
                </dd>
              </div>
              <div>
                <dt>Local storage</dt>
                <dd>
                  {HOSTED_PREVIEW
                    ? "Editable reviews and original attachments are kept in this browser. Export a review to keep a separate copy."
                    : "Editable reviews are kept in this browser. Live run snapshots and traces are retained by the local analysis service. Export a review to keep a separate copy."}
                </dd>
              </div>
              <div>
                <dt>Deployment scope</dt>
                <dd>
                  {HOSTED_PREVIEW
                    ? "This is a single-user browser preview. Shared team identity, authenticated approvals and hosted AI analysis are not configured. No hardware is controlled or validated."
                    : "This is a single-user local workspace. Shared team identity, authenticated approvals and hosted operations are not configured. No hardware is controlled or validated."}
                </dd>
              </div>
            </dl>
          </div>
          <div className="dialog-footer">
            <button className="primary-button" onClick={() => setAbout(false)}>
              Done
            </button>
          </div>
        </Dialog>
      )}
      {deleteTarget && (
        <Dialog
          title="Delete this review?"
          onClose={() => setDeleteTarget(null)}
        >
          <p className="dialog-copy">
            This removes “{deleteTarget.title || "Untitled review"}” and its
            sources from this browser. Export anything you want to keep first.
          </p>
          <div className="dialog-footer">
            <button
              className="secondary-button"
              onClick={() => setDeleteTarget(null)}
            >
              Keep review
            </button>
            <button
              className="primary-button danger-button"
              onClick={() => void removeBrief()}
            >
              Delete review
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
