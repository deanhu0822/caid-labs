import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Table2,
  X,
  ArrowUpRight,
  ScanText,
  Download,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import type { Source } from "../domain";
import { OCR_DESCRIPTION, readImageText } from "../inputs";
import { Dialog } from "./Dialog";
import { PdfPreview } from "./PdfPreview";
import { CsvTable } from "./CsvTable";

export function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function SourceIcon({
  kind,
  size = 19,
}: {
  kind: Source["kind"];
  size?: number;
}) {
  return kind === "image" ? (
    <ImageIcon size={size} />
  ) : kind === "csv" ? (
    <Table2 size={size} />
  ) : (
    <FileText size={size} />
  );
}

export function sourceDescription(source: Source) {
  if (source.status === "error") return "Needs attention";
  if (source.text.trim())
    return source.pageCount
      ? `${source.pageCount} ${source.pageCount === 1 ? "page" : "pages"} · text available`
      : "Text available";
  return source.kind === "image" ? "Visual reference" : "No readable text";
}

export function SourceCard({
  source,
  onOpen,
  onRemove,
  disabled,
}: {
  source: Source;
  onOpen: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const url = useBlobUrl(source.kind === "image" ? source.blob : undefined);
  return (
    <div
      className={`source-card ${source.status === "error" ? "source-error" : ""}`}
    >
      <button
        className="source-open"
        disabled={disabled}
        onClick={onOpen}
        aria-label={`Open ${source.name}`}
      >
        <span className={`source-thumb ${source.kind}`}>
          {url ? <img src={url} alt="" /> : <SourceIcon kind={source.kind} />}
        </span>
        <span className="source-card-text">
          <strong>{source.name}</strong>
          <span>{sourceDescription(source)}</span>
          {(source.appliesTo||source.locator)&&<span>{[source.appliesTo,source.locator].filter(Boolean).join(" · ")}</span>}
        </span>
        {!onRemove && <ArrowUpRight size={16} className="source-arrow" />}
      </button>
      {onRemove && (
        <button
          className="source-remove icon-button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove ${source.name}`}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function SourceDialog({
  initialPage,
  source,
  onClose,
  onChange,
}: {
  source: Source;
  initialPage?:number;
  onClose: () => void;
  onChange: (value: Source) => void;
}) {
  const url = useBlobUrl(source.blob);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrError, setOcrError] = useState("");
  const ocrController = useRef<AbortController | null>(null);
  useEffect(() => () => ocrController.current?.abort(), []);
  const note = source.note;
  async function readText() {
    setBusy(true);
    setProgress(0);
    setOcrError("");
    const controller = new AbortController();
    ocrController.current = controller;
    try {
      const next = await readImageText(source, setProgress, controller.signal);
      if (controller.signal.aborted) return;
      if (next.error) setOcrError(next.error);
      onChange({ ...next, note });
    } catch (error) {
      setOcrError(
        error instanceof Error
          ? error.message
          : "Text could not be read. Add a note instead.",
      );
    } finally {
      setBusy(false);
    }
  }
  function close() {
    ocrController.current?.abort();
    onClose();
  }
  return (
    <Dialog title={source.name} onClose={close} wide>
      <div className="source-meta">
        <span className="tag">
          <SourceIcon kind={source.kind} size={13} />
          {source.kind.toUpperCase()}
        </span>
        <span>{Math.max(1, Math.round(source.size / 1024))} KB</span>
        <span>{sourceDescription(source)}</span>
          {(source.appliesTo||source.locator)&&<span>{[source.appliesTo,source.locator].filter(Boolean).join(" · ")}</span>}
        {url && (
          <a href={url} download={source.name} className="text-button">
            <Download size={14} /> Download original
          </a>
        )}
      </div>
      <div className="source-content">
        {source.kind === "image" && url && (
          <div className="image-preview">
            <img
              src={url}
              alt={source.note || `Attached reference: ${source.name}`}
            />
          </div>
        )}
        {source.kind === "pdf" && source.blob && (
          <PdfPreview blob={source.blob} name={source.name} initialPage={initialPage}/>
        )}
        {source.readNotice && <p className="quiet-note">{source.kind==="image"&&!source.text ? "Original image for visual analysis. Reading its text locally is optional.":source.readNotice}</p>}
        {source.error && !ocrError && (
          <p className="inline-alert">
            <AlertCircle size={17} />
            {source.error}
          </p>
        )}
        {source.text && (
          <details className="extracted-section" open={source.kind==="csv"}>
            <summary>
              {source.kind === "image" ? "Text read from image" : "Source text"}
            </summary>
            {source.kind === "csv" ? (
              <CsvTable text={source.text} />
            ) : (
              <pre className="extracted-text">{source.text}</pre>
            )}
          </details>
        )}
        {source.kind === "image" && (
          <div className="ocr-block">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={readText}
            >
              {busy ? (
                <LoaderCircle size={16} className="spinning" />
              ) : (
                <ScanText size={16} />
              )}
              {busy
                ? `Reading text… ${Math.round(progress * 100)}%`
                : source.text
                  ? "Read text again"
                  : "Read text in image"}
            </button>
            {busy && (
              <button
                className="text-button cancel-reading"
                onClick={() => ocrController.current?.abort()}
              >
                Cancel reading
              </button>
            )}
            <p>{OCR_DESCRIPTION}</p>
            {ocrError && (
              <p role="alert" className="error-text">
                {ocrError}
              </p>
            )}
          </div>
        )}
        <label className="field-label">Applies to<input className="context-input" value={source.appliesTo || ''} placeholder="Part, requirement, or proposed change" disabled={busy} onChange={e=>onChange({...source,appliesTo:e.target.value})}/></label>
        <label className="field-label">Location in source<input className="context-input" value={source.locator || ''} placeholder="PDF page 7, CSV row 12, image upper left…" disabled={busy} onChange={e=>onChange({...source,locator:e.target.value})}/></label>
        <label className="field-label" htmlFor="source-note">
          Your note<span>What should this source help explain?</span>
        </label>
        <textarea
          id="source-note"
          rows={3}
          value={note}
          disabled={busy}
          placeholder="Add context, a constraint, or something to check…"
          onChange={(event) =>
            onChange({ ...source, note: event.target.value })
          }
        />
        <p className="quiet-note">
          Source content is reference material. Only your request and notes
          direct the review.
        </p>
      </div>
      <div className="dialog-footer">
        <button className="primary-button" onClick={close} disabled={busy}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
