import { useEffect, useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadJsPDF, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

type Mode = "draw" | "type";

const DISPLAY_SCALE = 1.2;
const SIG_WIDTH = 0.35; // fraction of page width

// Renders a single PDF page to a canvas; clicking sets the signature position.
function SignPageView({
  pdf,
  pageNum,
  onPlace,
}: {
  pdf: any;
  pageNum: number;
  onPlace: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function draw() {
      if (!pdf || !ref.current) return;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: DISPLAY_SCALE });
      const canvas = ref.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
    draw();
  }, [pdf, pageNum]);

  return <canvas ref={ref} className="sign-page" onClick={onPlace} style={{ cursor: "crosshair" }} />;
}

export default function SignPdf({ messages }: Props) {
  const drawRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [typed, setTyped] = useState("");
  const [fontSize, setFontSize] = useState(40);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("signed.pdf");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const accept = "application/pdf,.pdf";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setPlaced(null);
    setPageNum(1);
    setState("idle");
    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerMod = await import("pdfjs-dist/build/pdf.worker.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      const data = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
    } catch {
      setState("error");
    }
  }

  function initDrawCanvas() {
    const canvas = drawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000";
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
    ctx.stroke();
  }

  function endDraw() {
    drawing.current = false;
    const canvas = drawRef.current;
    if (canvas) setSignatureUrl(canvas.toDataURL("image/png"));
  }

  function buildTypedSignature(): string | null {
    if (!typed.trim()) return null;
    const c = document.createElement("canvas");
    c.width = 500;
    c.height = 160;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#000";
    ctx.font = `italic ${fontSize}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typed, c.width / 2, c.height / 2);
    return c.toDataURL("image/png");
  }

  function signTyped() {
    setSignatureUrl(buildTypedSignature());
    setPlaced(null);
  }

  function placeOnPage(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPlaced({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  }

  async function bake() {
    if (!file || !signatureUrl) return;
    setState("processing");
    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerMod = await import("pdfjs-dist/build/pdf.worker.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      const { jsPDF } = await loadJsPDF();
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;

      // Render the first page up-front so we can create the doc at its true size.
      const firstPage = await pdf.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: DISPLAY_SCALE });
      const w0 = Math.round((firstViewport.width / DISPLAY_SCALE) * 0.75);
      const h0 = Math.round((firstViewport.height / DISPLAY_SCALE) * 0.75);
      const doc = new jsPDF({
        unit: "pt",
        format: [w0, h0],
        orientation: w0 >= h0 ? "landscape" : "portrait",
      });

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: DISPLAY_SCALE });
        const off = document.createElement("canvas");
        off.width = viewport.width;
        off.height = viewport.height;
        const ctx = off.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Real page size in points (jsPDF uses pt; 1pt ≈ 0.75 CSS px at scale 1).
        const w = Math.round((viewport.width / DISPLAY_SCALE) * 0.75);
        const h = Math.round((viewport.height / DISPLAY_SCALE) * 0.75);

        // addPage(...) with custom size for every page after the first,
        // since the first page must be passed to the jsPDF constructor.
        if (p > 1) {
          doc.addPage([w, h], w >= h ? "landscape" : "portrait");
        }

        // Draw the rendered page filling the output page (no distortion).
        doc.addImage(off.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);

        // Place the signature at the user's normalized position, scaled to points.
        if (placed && p === pageNum) {
          const sigW = w * SIG_WIDTH;
          const sigH = sigW * (160 / 500);
          doc.addImage(signatureUrl, "PNG", placed.x * w, placed.y * h, sigW, sigH);
        }
      }

      const blob = doc.output("blob");
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`signed-${Date.now()}.pdf`);
      setDoneLabel(`Signature placed on page ${pageNum} · ${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setTyped("");
    setSignatureUrl(null);
    setPlaced(null);
    setPageNum(1);
    setTotalPages(0);
    setPdfDoc(null);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  return (
    <div className="tool">
      <FileDropzone
        accept={accept}
        onFiles={handleFiles}
        busy={state === "processing"}
        messages={messages}
        hint="PDF"
      />

      {file && (
        <div className="sign-editor">
          <div className="sign-mode">
            <label className="radio">
              <input type="radio" name="signmode" checked={mode === "draw"} onChange={() => { setMode("draw"); setSignatureUrl(null); }} />
              <span>Draw</span>
            </label>
            <label className="radio">
              <input type="radio" name="signmode" checked={mode === "type"} onChange={() => { setMode("type"); setSignatureUrl(null); }} />
              <span>Type</span>
            </label>
          </div>

          {mode === "draw" ? (
            <div className="sign-draw">
              <canvas
                ref={drawRef}
                className="sign-canvas"
                width={500}
                height={160}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); initDrawCanvas(); startDraw(e); }}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
              />
              <button type="button" className="btn btn--secondary" onClick={initDrawCanvas}>
                Clear
              </button>
            </div>
          ) : (
            <div className="sign-type">
              <input
                className="input"
                type="text"
                placeholder="Type your name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={state === "processing"}
              />
              <label>
                Size
                <input type="number" min="16" max="120" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
              </label>
              <button type="button" className="btn btn--secondary" onClick={signTyped} disabled={!typed.trim()}>
                Preview
              </button>
            </div>
          )}

          {signatureUrl && (
            <div className="sign-preview">
              <img src={signatureUrl} alt="Signature preview" className="sign-preview__sig" />
              <p className="sign-hint">Click on the page below to place your signature.</p>
              <div className="sign-pages-nav">
                <button type="button" className="btn btn--ghost" disabled={pageNum <= 1} onClick={() => setPageNum(pageNum - 1)}>‹ Prev</button>
                <span>Page {pageNum} / {totalPages}</span>
                <button type="button" className="btn btn--ghost" disabled={pageNum >= totalPages} onClick={() => setPageNum(pageNum + 1)}>Next ›</button>
              </div>
              <div className="sign-page-wrap">
                <SignPageView pdf={pdfDoc} pageNum={pageNum} onPlace={placeOnPage} />
                {placed && (
                  <div className="sign-place-marker" style={{ left: `${placed.x * 100}%`, top: `${placed.y * 100}%` }}>
                    <img src={signatureUrl} alt="" />
                  </div>
                )}
              </div>
            </div>
          )}

          {signatureUrl && state !== "done" && (
            <button type="button" className="btn btn--primary btn--block" disabled={state === "processing"} onClick={bake}>
              {messages.download}
            </button>
          )}

          <p className="legal-note">{messages.legalNote}</p>
        </div>
      )}

      <ProcessResult
        messages={messages}
        state={state}
        doneLabel={doneLabel}
        onReset={reset}
      >
        {state === "done" && downloadUrl && (
          <a className="btn btn--primary" href={downloadUrl} download={filename}>
            {messages.download}
          </a>
        )}
      </ProcessResult>
    </div>
  );
}
