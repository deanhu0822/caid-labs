import {ANALYSIS_LIMITS} from './analysis-limits';
import type { Source } from "./domain";

export const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.csv";
export const MAX_FILES = ANALYSIS_LIMITS.sources;
export const MAX_FILE_BYTES = ANALYSIS_LIMITS.fileBytes;
export const MAX_PDF_PAGES = ANALYSIS_LIMITS.pdfPages;
export const MAX_TEXT_CHARACTERS = ANALYSIS_LIMITS.textCharacters;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const OCR_TIMEOUT_MS = 90_000;
export const OCR_DESCRIPTION =
  "Local text reading stays on this device and downloads its reader on first use. Live analysis separately sends attached files to Anthropic.";

type Format = { kind: Source["kind"]; mime: string; acceptedMime: string[] };
const formats: Record<string, Format> = {
  png: { kind: "image", mime: "image/png", acceptedMime: ["image/png"] },
  jpg: { kind: "image", mime: "image/jpeg", acceptedMime: ["image/jpeg"] },
  jpeg: { kind: "image", mime: "image/jpeg", acceptedMime: ["image/jpeg"] },
  webp: { kind: "image", mime: "image/webp", acceptedMime: ["image/webp"] },
  pdf: {
    kind: "pdf",
    mime: "application/pdf",
    acceptedMime: ["application/pdf"],
  },
  txt: { kind: "text", mime: "text/plain", acceptedMime: ["text/plain"] },
  md: {
    kind: "text",
    mime: "text/markdown",
    acceptedMime: ["text/markdown", "text/x-markdown", "text/plain"],
  },
  csv: {
    kind: "csv",
    mime: "text/csv",
    acceptedMime: [
      "text/csv",
      "application/csv",
      "text/plain",
      "application/vnd.ms-excel",
    ],
  },
};

function formatFor(file: File): Format | undefined {
  return formats[file.name.split(".").pop()?.toLowerCase() ?? ""];
}

/** Fast validation for the picker. Byte validation happens in importFile. */
export function validateFile(file: File): string | null {
  const format = formatFor(file);
  if (!format)
    return "Choose a PNG, JPEG, WebP, PDF, TXT, Markdown, or CSV file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) return "This file is larger than 10 MB.";
  // Some systems do not supply a specific MIME type for local files.
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    !format.acceptedMime.includes(file.type.toLowerCase())
  ) {
    return "The file type does not match its name. Export it in a supported format.";
  }
  return null;
}

function matches(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function hasSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/png")
    return (
      bytes.length >= 24 &&
      matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10]) &&
      matches(bytes, [73, 72, 68, 82], 12)
    );
  if (mime === "image/jpeg")
    return bytes.length >= 4 && matches(bytes, [255, 216, 255]);
  if (mime === "image/webp")
    return (
      bytes.length >= 16 &&
      matches(bytes, [82, 73, 70, 70]) &&
      matches(bytes, [87, 69, 66, 80], 8)
    );
  if (mime === "application/pdf") return matches(bytes, [37, 80, 68, 70, 45]);
  return false;
}

async function verifyImage(blob: Blob): Promise<void> {
  let width: number;
  let height: number;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } else if (typeof Image !== "undefined") {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      width = image.naturalWidth;
      height = image.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    throw new Error(
      "Image previews are unavailable in this browser. Try a current browser.",
    );
  }
  if (!width || !height)
    throw new Error(
      "This image could not be opened. Export it again as PNG or JPEG.",
    );
  if (width * height > MAX_IMAGE_PIXELS)
    throw new Error(
      "This image is too large to preview. Resize it to 40 megapixels or less.",
    );
}

function trimText(text: string): { text: string; truncated: boolean } {
  const clean = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return {
    text: clean.slice(0, MAX_TEXT_CHARACTERS),
    truncated: clean.length > MAX_TEXT_CHARACTERS,
  };
}

function readPlainText(bytes: Uint8Array): {
  text: string;
  truncated: boolean;
} {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "This file is not UTF-8 text. Save a UTF-8 TXT, Markdown, or CSV copy.",
    );
  }
  // Text is displayed as text, never interpreted as HTML. Reject disguised web pages
  // and binary data as well, so unsupported formats cannot masquerade as evidence.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(
      "This contains binary data. Choose a plain text, Markdown, or CSV file.",
    );
  }
  if (
    /<\s*(?:!doctype\s+html|(?:html|head|body|script|iframe|svg|style|meta|link|div|span|img|form|input|button|table|object|embed)\b)/i.test(
      text,
    )
  ) {
    throw new Error(
      "HTML and active web content are not supported. Export a plain text copy.",
    );
  }
  if (/^\s*%PDF-/.test(text))
    throw new Error(
      "This appears to be a PDF. Attach it with its original .pdf extension.",
    );
  return trimText(text);
}

async function readPdf(
  bytes: Uint8Array,
): Promise<Pick<Source, "text" | "status" | "readNotice" | "pageCount" | "pageTexts">> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: bytes,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const pdf = await task.promise;
    const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];
    let characters = 0;
    let readPages = 0;
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "",
        )
        .join("")
        .trim();
      pages.push(text);
      readPages += 1;
      characters += text.length;
      page.cleanup();
      if (characters > MAX_TEXT_CHARACTERS) break;
    }
    const result = trimText(pages.join("\n\n"));
    const limits = [
      readPages < pdf.numPages
        ? `Only the first ${readPages} of ${pdf.numPages} pages were read.`
        : "",
      result.truncated
        ? `Text is limited to ${MAX_TEXT_CHARACTERS.toLocaleString("en-US")} characters.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      text: result.text,
      pageCount: pdf.numPages,
      pageTexts: pages.map((p,i)=>p.slice(0,Math.max(0,MAX_TEXT_CHARACTERS-pages.slice(0,i).reduce((n,t)=>n+t.length+2,0)))),
      status: result.text ? "ready" : "reference",
      readNotice: [
        result.text
          ? "Selectable text extracted locally. Check the original for layout and tables."
          : "No selectable text found. Image-only PDFs remain references; PDF text recognition is not available.",
        limits,
      ]
        .filter(Boolean)
        .join(" "),
    };
  } finally {
    await task.destroy();
  }
}

/** File bytes stay in the browser; failures are returned as inspectable sources. */
export async function importFile(file: File): Promise<Source> {
  const format = formatFor(file);
  const source: Source = {
    id: crypto.randomUUID(),
    name: file.name,
    kind: format?.kind ?? "text",
    mime: format?.mime ?? file.type,
    size: file.size,
    text: "",
    note: "",
    status: "reference",
  };
  const invalid = validateFile(file);
  if (invalid) return { ...source, status: "error", error: invalid };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (source.kind === "image" || source.kind === "pdf") {
      if (!hasSignature(bytes, source.mime))
        throw new Error(
          "The file contents do not match its format. Export the original file again.",
        );
      if (source.kind === "image") {
        const blob = new Blob([bytes], { type: source.mime });
        await verifyImage(blob);
        return {
          ...source,
          blob,
          readNotice:
            "Image attached as a visual reference. Live analysis can interpret it; local text reading is optional.",
        };
      }
      const extracted = await readPdf(bytes);
      return { ...source, ...extracted, blob: file };
    }
    const extracted = readPlainText(bytes);
    if (!extracted.text) throw new Error("This file has no readable text.");
    return {
      ...source,
      text: extracted.text,
      blob: file,
      status: "ready",
      readNotice: `Text read locally.${extracted.truncated ? ` Only the first ${MAX_TEXT_CHARACTERS.toLocaleString("en-US")} characters are included.` : ""}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ...source,
      status: "error",
      error: message.toLowerCase().includes("password")
        ? "This PDF needs a password. Attach an unlocked copy."
        : message ||
          "This file could not be read. Export a fresh copy and try again.",
    };
  }
}

/** Explicit opt-in English OCR. Only recognition assets are downloaded. */
export async function readImageText(
  source: Source,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Source> {
  const cancelledMessage =
    "Text reading cancelled. Your image is still attached.";
  if (signal?.aborted) return { ...source, error: cancelledMessage };
  if (source.kind !== "image" || !source.blob)
    return {
      ...source,
      error: "Text reading is available for attached images.",
    };
  let worker:
    | Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
    | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectFailure: (reason: unknown) => void = () => {};
  const failure = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
    timer = setTimeout(
      () => reject(new Error("Text reading timed out.")),
      OCR_TIMEOUT_MS,
    );
  });
  // Attach a handler before loading the library so a slow module load cannot
  // create an unhandled rejection when the timeout expires.
  void failure.catch(() => undefined);
  const cancel = () => rejectFailure(new Error(cancelledMessage));
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const [{ createWorker, OEM }, { default: workerUrl }] = await Promise.race([
      Promise.all([
        import("tesseract.js"),
        import("tesseract.js/dist/worker.min.js?url"),
      ]),
      failure,
    ]);
    if (signal?.aborted) throw new Error(cancelledMessage);
    const creating = createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: workerUrl,
      workerBlobURL: false,
      logger: ({ status, progress }) => {
        if (!finished && !signal?.aborted && status === "recognizing text")
          onProgress?.(Math.min(1, Math.max(0, progress)));
      },
      // Language-download failures do not reject Tesseract's initialization
      // promise, so explicitly propagate them to the waiting UI.
      errorHandler: rejectFailure,
    });
    void creating
      .then((loaded) => {
        if (finished) void loaded.terminate().catch(() => undefined);
      })
      .catch(() => undefined);
    worker = await Promise.race([creating, failure]);
    if (signal?.aborted) throw new Error(cancelledMessage);
    const result = await Promise.race([worker.recognize(source.blob), failure]);
    const extracted = trimText(result.data.text);
    onProgress?.(1);
    return {
      ...source,
      text: extracted.text,
      status: extracted.text ? "ready" : "reference",
      readNotice: extracted.text
        ? `English text read locally. Check the wording against the image.${extracted.truncated ? ` Only the first ${MAX_TEXT_CHARACTERS.toLocaleString("en-US")} characters were read.` : ""}`
        : source.readNotice,
      error: extracted.text
        ? undefined
        : "No readable English text found. The image is still attached; add a note to describe what matters.",
    };
  } catch {
    return {
      ...source,
      error: signal?.aborted
        ? cancelledMessage
        : "Text reading could not finish. The first use needs an internet connection to download recognition files. Your image is still attached; retry or add a note.",
    };
  } finally {
    finished = true;
    signal?.removeEventListener("abort", cancel);
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
