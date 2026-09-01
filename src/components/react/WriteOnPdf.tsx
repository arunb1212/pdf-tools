import { useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadJsPDF, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

interface TextBox {
  id: number;
  /** normalized [0..1] position within the page */
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
}

const DISPLAY_SCALE = 1.2;

function renderPageToCanvas(page: any, canvas: HTMLCanvasElement) {
  const viewport = page.getViewport({ scale: DISPLAY_SCALE });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  return page.render({ canvasContext: ctx, viewport }).promise;
}

export default function WriteOnPdf({ messages }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [boxes, setBoxes] = useState<TextBox[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [numRef, setNumRef] = useState<{ pdf: any; doc: any } | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("annotated.pdf");
  const nextId = useRef(1);

  const accept = "application/pdf,.pdf";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setBoxes([]);
    setSelected(null);
    setEditing(null);
    setPageNum(1);
    setState("idle");
    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerUrl = await import("pdfjs-dist/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
      const data = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      setTotalPages(pdf.numPages);
      setNumRef({ pdf, doc: pdf });
      await drawPage(1, pdf);
    } catch {
      setState("error");
    }
  }

  async function drawPage(p: number, doc: any) {
    const page = await doc.getPage(p);
    if (canvasRef.current) {
      await renderPageToCanvas(page, canvasRef.current);
    }
  }

  async function goToPage(p: number) {
    const clamped = Math.max(1, Math.min(p, totalPages));
    setPageNum(clamped);
    setSelected(null);
    setEditing(null);
    if (numRef) await drawPage(clamped, numRef.doc);
  }

  // Add a box at the click position on the canvas.
  function addBox(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const id = nextId.current++;
    setEditing(id);
    setSelected(id);
    setBoxes((prev) => [...prev, { id, x, y, text: "Text", size: 24, color: "#000000" }]);
  }

  function updateBox(id: number, patch: Partial<TextBox>) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBox(id: number) {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelected(null);
    setEditing(null);
  }

  async function bake() {
    if (!file || !canvasRef.current) return;
    setState("processing");
    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerUrl = await import("pdfjs-dist/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
      const { jsPDF } = await loadJsPDF();
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;

      const doc = new jsPDF({ unit: "px", format: [595, 842], orientation: "portrait" });
      const bgPageWidthRatio = 595;
      const bgPageHeightRatio = 842;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: DISPLAY_SCALE });
        const off = document.createElement("canvas");
        off.width = viewport.width;
        off.height = viewport.height;
        const ctx = off.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Normalize the page to A4 aspect for the output PDF.
        const scaleX = bgPageWidthRatio / off.width;
        const scaleY = bgPageHeightRatio / off.height;
        const noiseScale = Math.max(scaleX, scaleY);

        if (p > 1) doc.addPage([bgPageWidthRatio, bgPageHeightRatio], "portrait");
        doc.addImage(off.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, bgPageWidthRatio, bgPageHeightRatio);

        // Draw text boxes at normalized coords (scaled onto the A4 page).
        for (const b of boxes) {
          if (b.text.trim() === "") continue;
          doc.setFontSize(b.size * noiseScale * 0.75);
          doc.setTextColor(b.color);
          const px = b.x * bgPageWidthRatio;
          const py = b.y * bgPageHeightRatio;
          doc.text(b.text, px, py);
        }
      }

      const blob = doc.output("blob");
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`annotated-${Date.now()}.pdf`);
      setDoneLabel(`Added ${boxes.length} text box${boxes.length !== 1 ? "es" : ""} · ${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setBoxes([]);
    setSelected(null);
    setEditing(null);
    setPageNum(1);
    setTotalPages(0);
    setNumRef(null);
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
        <div className="write-editor">
          <div className="write-toolbar">
            <div className="write-nav">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={pageNum <= 1 || state === "processing"}
                onClick={() => goToPage(pageNum - 1)}
              >
                ‹ Prev
              </button>
              <span className="write-page">
                Page {pageNum} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={pageNum >= totalPages || state === "processing"}
                onClick={() => goToPage(pageNum + 1)}
              >
                Next ›
              </button>
            </div>
            <div className="write-controls">
              <label>
                Size
                <input
                  type="number"
                  min="8"
                  max="120"
                  value={boxes.find((b) => b.id === selected)?.size ?? 24}
                  onChange={(e) => {
                    if (selected !== null) updateBox(selected, { size: Number(e.target.value) });
                  }}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={boxes.find((b) => b.id === selected)?.color ?? "#000000"}
                  onChange={(e) => {
                    if (selected !== null) updateBox(selected, { color: e.target.value });
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={selected === null}
                onClick={() => selected !== null && removeBox(selected)}
              >
                Delete
              </button>
            </div>
          </div>

          <p className="write-hint">Click anywhere on the page to add a text box, then type in it.</p>

          <div className="write-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="write-canvas"
              onClick={addBox}
              style={{ cursor: "crosshair" }}
            />
            {/* Overlay text boxes positioned by normalized coords */}
            {boxes.map((b) => (
              <div
                key={b.id}
                className={`write-box${selected === b.id ? " is-selected" : ""}`}
                style={{
                  left: `${b.x * 100}%`,
                  top: `${b.y * 100}%`,
                  fontSize: b.size,
                  color: b.color,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelected(b.id);
                }}
              >
                {editing === b.id ? (
                  <input
                    autoFocus
                    className="write-box__input"
                    value={b.text}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    onChange={(e) => updateBox(b.id, { text: e.target.value })}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditing(b.id);
                    }}
                  >
                    {b.text}
                  </span>
                )}
              </div>
            ))}
          </div>

          {boxes.length > 0 && state !== "done" && (
            <div className="write-actions">
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={state === "processing"}
                onClick={bake}
              >
                {messages.download}
              </button>
            </div>
          )}
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
