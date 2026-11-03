import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  importFile,
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_CHARACTERS,
  OCR_TIMEOUT_MS,
  readImageText,
  validateFile,
} from "./inputs";
import type { Source } from "./domain";

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  createWorker: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: { workerSrc: "" },
}));
vi.mock("tesseract.js", () => ({
  createWorker: mocks.createWorker,
  OEM: { LSTM_ONLY: 1 },
}));

const textFile = (text: string, name = "notes.txt", type = "text/plain") =>
  new File([text], name, { type });
const pngHeader = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1,
]);
const imageSource = (): Source => ({
  id: "image",
  name: "part.png",
  kind: "image",
  mime: "image/png",
  size: 24,
  blob: new Blob([pngHeader]),
  text: "",
  note: "Connector label on the left.",
  status: "reference",
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("file boundaries", () => {
  it("accepts the size limit and rejects larger files without reading their bytes", () => {
    const atLimit = new File([new Uint8Array(MAX_FILE_BYTES)], "at-limit.txt", {
      type: "text/plain",
    });
    expect(validateFile(atLimit)).toBeNull();
    const overLimit = new File(
      [new Uint8Array(MAX_FILE_BYTES + 1)],
      "too-large.txt",
      { type: "text/plain" },
    );
    expect(validateFile(overLimit)).toMatch(/larger than 10 MB/);
  });

  it("rejects empty files, unsupported formats, and conflicting MIME types", () => {
    expect(validateFile(textFile(""))).toMatch(/empty/);
    expect(validateFile(textFile("model", "part.step"))).toMatch(/Choose/);
    expect(
      validateFile(textFile("video", "clip.mov", "video/quicktime")),
    ).toMatch(/Choose/);
    expect(validateFile(textFile("text", "drawing.png", "text/plain"))).toMatch(
      /does not match/,
    );
    expect(validateFile(textFile("text", "NOTES.MD", ""))).toBeNull();
  });
});

describe("text imports", () => {
  it("preserves Unicode and normalizes line endings", async () => {
    const source = await importFile(
      textFile(
        "\uFEFF電源 ±5 V\r\nMünchen — ΔT ≤ 10°C",
        "notes.md",
        "text/markdown",
      ),
    );
    expect(source.status).toBe("ready");
    expect(source.text).toBe("電源 ±5 V\nMünchen — ΔT ≤ 10°C");
    expect(source.blob).toBeInstanceOf(Blob);
    expect(source.note).toBe("");
    expect(source.readNotice).toContain("Text read locally");
  });

  it("preserves CSV as source text without evaluating spreadsheet formulas", async () => {
    const source = await importFile(
      textFile(
        'part,note\nJ12,"=HYPERLINK(""https://example.com"")"',
        "bom.csv",
        "text/csv",
      ),
    );
    expect(source.status).toBe("ready");
    expect(source.kind).toBe("csv");
    expect(source.text).toContain("=HYPERLINK");
  });

  it.each([
    new File([new Uint8Array([0, 1, 2, 3])], "binary.txt", {
      type: "text/plain",
    }),
    new File([new Uint8Array([0xff, 0xfe, 0xff])], "invalid-utf8.txt", {
      type: "text/plain",
    }),
    textFile("<!DOCTYPE html><html><body>Renamed page</body></html>"),
    textFile("<script>alert(1)</script>"),
    textFile('<svg onload="alert(1)"></svg>'),
    textFile('<img src="x" onerror="alert(1)">'),
    textFile("%PDF-1.7\nRenamed PDF"),
  ])("rejects disguised binary or active web content: $name", async (file) => {
    const source = await importFile(file);
    expect(source.status).toBe("error");
    expect(source.text).toBe("");
    expect(source.blob).toBeUndefined();
  });

  it("reports text truncation instead of silently dropping evidence", async () => {
    const source = await importFile(
      textFile("a".repeat(MAX_TEXT_CHARACTERS + 1)),
    );
    expect(source.text).toHaveLength(MAX_TEXT_CHARACTERS);
    expect(source.readNotice).toContain("first 120,000");
  });
});

describe("media validation", () => {
  it.each([
    textFile("<html>not an image</html>", "image.png", "image/png"),
    textFile("not a PDF", "datasheet.pdf", "application/pdf"),
    new File([pngHeader], "mismatch.jpg", { type: "image/jpeg" }),
  ])("rejects false media signatures: $name", async (file) => {
    const source = await importFile(file);
    expect(source.status).toBe("error");
    expect(source.error).toMatch(/contents do not match/);
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("also rejects a correct header with an undecodable image body", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockRejectedValue(new Error("The source image could not be decoded.")),
    );
    const source = await importFile(
      new File([pngHeader], "broken.png", { type: "image/png" }),
    );
    expect(source.status).toBe("error");
    expect(source.blob).toBeUndefined();
  });

  it("attaches a valid image as a reference without claiming interpretation", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1, height: 1, close }),
    );
    const source = await importFile(
      new File([pngHeader], "label.png", { type: "image/png" }),
    );
    expect(source.status).toBe("reference");
    expect(source.text).toBe("");
    expect(source.blob?.type).toBe("image/png");
    expect(source.note).toBe("");
    expect(source.readNotice).toContain("visual reference");
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });
});

describe("PDF extraction", () => {
  function pdfMock(numPages: number, words = "Rated current: 2 A") {
    const cleanup = vi.fn();
    const getPage = vi
      .fn()
      .mockResolvedValue({
        getTextContent: vi
          .fn()
          .mockResolvedValue({ items: [{ str: words, hasEOL: true }] }),
        cleanup,
      });
    const destroy = vi.fn().mockResolvedValue(undefined);
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages, getPage }),
      destroy,
    });
    return { getPage, destroy, cleanup };
  }

  it("limits page extraction and tells users what was omitted", async () => {
    const { getPage, destroy } = pdfMock(45);
    const source = await importFile(
      textFile("%PDF-1.7\nmock", "datasheet.pdf", "application/pdf"),
    );
    expect(source.status).toBe("ready");
    expect(source.pageCount).toBe(45);
    expect(getPage).toHaveBeenCalledTimes(MAX_PDF_PAGES);
    expect(source.note).toBe("");
    expect(source.readNotice).toContain("first 30 of 45 pages");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("keeps a PDF with no selectable text as a reference", async () => {
    pdfMock(1, "");
    const source = await importFile(
      textFile("%PDF-1.7\nmock", "scan.pdf", "application/pdf"),
    );
    expect(source.status).toBe("reference");
    expect(source.text).toBe("");
    expect(source.readNotice).toMatch(/PDF text recognition is not available/);
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });

  it("destroys failed PDF tasks and reports a recoverable error", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    mocks.getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("Invalid PDF structure.")),
      destroy,
    }));
    const source = await importFile(
      textFile("%PDF-1.7\nbroken", "bad.pdf", "application/pdf"),
    );
    expect(source.status).toBe("error");
    expect(destroy).toHaveBeenCalledOnce();
  });
});

describe("optional image text reading", () => {
  it("retains the user note, returns text, and releases its worker", async () => {
    const recognize = vi
      .fn()
      .mockResolvedValue({ data: { text: "  J12 connector\n" } });
    const terminate = vi.fn().mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({ recognize, terminate });
    const original = imageSource();
    const result = await readImageText(original);
    expect(result.text).toBe("J12 connector");
    expect(result.status).toBe("ready");
    expect(result.note).toBe(original.note);
    expect(result.readNotice).toContain("English text read locally");
    expect(recognize).toHaveBeenCalledWith(original.blob);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("recovers when a recognition asset download fails during initialization", async () => {
    mocks.createWorker.mockImplementation((_lang, _mode, options) => {
      queueMicrotask(() =>
        options.errorHandler(new Error("Failed to fetch language data.")),
      );
      return new Promise(() => {});
    });
    const original = imageSource();
    const result = await readImageText(original);
    expect(result.status).toBe("reference");
    expect(result.blob).toBe(original.blob);
    expect(result.note).toBe(original.note);
    expect(result.error).toMatch(/download recognition files/);
  });

  it("stops waiting on a stalled recognition and releases the worker", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn().mockResolvedValue(undefined);
    const recognize = vi.fn().mockReturnValue(new Promise(() => {}));
    mocks.createWorker.mockResolvedValue({ recognize, terminate });
    const reading = readImageText(imageSource());
    await vi.waitFor(() => expect(recognize).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS);
    const result = await reading;
    expect(result.status).toBe("reference");
    expect(result.error).toMatch(/could not finish/);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("returns immediately for an already cancelled request without starting a worker", async () => {
    const controller = new AbortController();
    controller.abort();
    const original = imageSource();
    const result = await readImageText(original, undefined, controller.signal);
    expect(result).toEqual({
      ...original,
      error: "Text reading cancelled. Your image is still attached.",
    });
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });

  it("cancels recognition, retains source content, and removes its abort listener", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const recognize = vi.fn().mockReturnValue(new Promise(() => {}));
    const terminate = vi.fn().mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({ recognize, terminate });
    const original = {
      ...imageSource(),
      text: "Previously read text",
      status: "ready" as const,
    };
    const reading = readImageText(original, undefined, controller.signal);
    await vi.waitFor(() => expect(recognize).toHaveBeenCalledOnce());
    controller.abort();
    const result = await reading;
    expect(result).toEqual({
      ...original,
      error: "Text reading cancelled. Your image is still attached.",
    });
    expect(terminate).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("returns during cancelled initialization and terminates a worker that arrives later", async () => {
    const controller = new AbortController();
    const recognize = vi.fn();
    const terminate = vi.fn().mockResolvedValue(undefined);
    let finishInitialization: (worker: {
      recognize: typeof recognize;
      terminate: typeof terminate;
    }) => void = () => {};
    mocks.createWorker.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishInitialization = resolve;
        }),
    );
    const reading = readImageText(imageSource(), undefined, controller.signal);
    await vi.waitFor(() => expect(mocks.createWorker).toHaveBeenCalledOnce());
    controller.abort();
    expect((await reading).error).toMatch(/cancelled/);
    finishInitialization({ recognize, terminate });
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledOnce());
    expect(recognize).not.toHaveBeenCalled();
  });
});
