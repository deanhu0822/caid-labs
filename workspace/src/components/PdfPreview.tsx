import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/** Render original bytes locally without relying on a browser PDF plugin. */
export function PdfPreview({ blob, name, initialPage=1 }: { blob: Blob; name: string; initialPage?:number }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    setDocument(null);
    setPageNumber(initialPage);
    setError('');
    setRendering(true);
    async function open() {
      try {
        const [pdfjs, { default: workerUrl }, bytes] = await Promise.all([
          import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'), blob.arrayBuffer(),
        ]);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        task = pdfjs.getDocument({ data: new Uint8Array(bytes), enableXfa: false, useSystemFonts: true });
        const pdf = await task.promise;
        if (!cancelled) { setPageNumber(Math.max(1, Math.min(initialPage, pdf.numPages))); setDocument(pdf); }
      } catch {
        if (!cancelled) {
          setError('This PDF preview could not be opened. Download the original to inspect it.');
          setRendering(false);
        }
      }
    }
    void open();
    return () => { cancelled = true; void task?.destroy().catch(() => undefined); };
  }, [blob, initialPage]);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    const target = canvas.current;
    setRendering(true);
    setError('');
    async function render() {
      try {
        const page = await document!.getPage(pageNumber);
        if (cancelled || !target) return;
        const size = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 1800 / size.width, 2400 / size.height);
        const viewport = page.getViewport({ scale });
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = page.render({ canvas: target, viewport });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch {
        if (!cancelled) {
          setError('This page could not be displayed. Try another page or download the original.');
          setRendering(false);
        }
      }
    }
    void render();
    return () => { cancelled = true; task?.cancel(); };
  }, [document, pageNumber]);

  const total = document?.numPages ?? 0;
  return <section className="pdf-viewer" aria-label={`Preview of ${name}`}>
    <div className="pdf-toolbar">
      <span>Original document</span>
      <div className="pdf-pagination">
        <button className="icon-button" aria-label="Previous PDF page" disabled={pageNumber <= 1 || rendering} onClick={() => setPageNumber(pageNumber - 1)}><ChevronLeft size={15}/></button>
        <label>Page <select aria-label="PDF page" value={pageNumber} disabled={!total} onChange={event => setPageNumber(Number(event.target.value))}>
          {Array.from({length: total || 1}, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select><span>of {total || '…'}</span></label>
        <button className="icon-button" aria-label="Next PDF page" disabled={!total || pageNumber >= total || rendering} onClick={() => setPageNumber(pageNumber + 1)}><ChevronRight size={15}/></button>
      </div>
    </div>
    <div className="pdf-page-scroll" aria-busy={rendering}>
      {rendering && <div className="pdf-loading" role="status"><LoaderCircle size={16} className="spinning"/> Opening page…</div>}
      {error && <p className="inline-alert" role="alert">{error}</p>}
      <canvas key={pageNumber} ref={canvas} hidden={!!error || !document} role="img" aria-label={`${name}, page ${pageNumber} of ${total}`}/>
    </div>
  </section>;
}
