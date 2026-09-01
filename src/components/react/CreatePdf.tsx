import { useEffect, useRef, useState } from "react";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadJsPDF, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

type Tool = "paint" | "text" | "line" | "image";

// A4 at ~150 DPI for a crisp rasterized page.
const PAGE_W = 1240;
const PAGE_H = 1754;

interface TextBox {
  id: number;
  /** normalized [0..1] position within the page */
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  bold: boolean;
  underline: boolean;
}

function makeText(x: number, y: number): TextBox {
  return {
    id: Date.now() + Math.random(),
    x,
    y,
    text: "Text",
    size: 48,
    color: "#121111",
    bold: false,
    underline: false,
  };
}

const TOOL_HINTS: Record<Tool, string> = {
  paint: "Draw with your pointer on the page.",
  text: "Click a spot, then type. Use B / U to bold or underline.",
  line: "Click and drag to draw a straight line.",
  image: "Choose an image, then click the page to place it.",
};

export default function CreatePdf({ messages }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placedImageRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<Tool>("paint");
  const [penColor, setPenColor] = useState("#121111");
  const [penSize, setPenSize] = useState(4);
  const [boxes, setBoxes] = useState<TextBox[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("created.pdf");

  function ctx() {
    return canvasRef.current!.getContext("2d")!;
  }

  function resetCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
  }

  useEffect(() => {
    resetCanvas();
  }, []);

  function snapshotBase() {
    const c = canvasRef.current!;
    const base = document.createElement("canvas");
    base.width = c.width;
    base.height = c.height;
    base.getContext("2d")!.drawImage(c, 0, 0);
    baseCanvasRef.current = base;
  }

  function restoreBase() {
    const base = baseCanvasRef.current;
    if (!base) return;
    const c = canvasRef.current!;
    const g = ctx();
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(base, 0, 0);
  }

  // Bake all text boxes onto the canvas as drawn text (with bold/underline).
  function bakeText() {
    restoreBase();
    const c = canvasRef.current!;
    const g = ctx();
    for (const b of boxes) {
      const px = b.x * c.width;
      const py = b.y * c.height;
      g.font = `${b.bold ? "bold " : ""}${Math.round(b.size)}px GeistSans, sans-serif`;
      g.fillStyle = b.color;
      g.textBaseline = "top";
      g.fillText(b.text, px, py);
      if (b.underline) {
        const w = g.measureText(b.text).width;
        g.strokeStyle = b.color;
        g.lineWidth = Math.max(1, b.size / 14);
        g.beginPath();
        g.moveTo(px, py + b.size * 1.18);
        g.lineTo(px + w, py + b.size * 1.18);
        g.stroke();
      }
    }
  }

  function toCanvas(e: React.PointerEvent | React.MouseEvent) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (state === "processing") return;
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    const pt = toCanvas(e);
    const g = ctx();

    if (tool === "paint") {
      snapshotBase();
      setDrawing(true);
      g.beginPath();
      g.moveTo(pt.x, pt.y);
      g.strokeStyle = penColor;
      g.lineWidth = penSize;
      g.lineCap = "round";
      g.lineJoin = "round";
    } else if (tool === "line") {
      setStartPt(pt);
      setDrawing(true);
      g.strokeStyle = penColor;
      g.lineWidth = penSize;
      g.lineCap = "round";
    } else if (tool === "text") {
      const b = makeText(pt.x / c.width, pt.y / c.height);
      setEditing(b.id);
      setSelected(b.id);
      setBoxes((prev) => [...prev, b]);
    } else if (tool === "image") {
      if (placedImageRef.current) {
        snapshotBase();
        const img = placedImageRef.current;
        // Fit the image to ~40% page width, preserving aspect.
        const maxW = c.width * 0.4;
        const scale = Math.min(maxW / img.width, c.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        g.drawImage(img, pt.x - w / 2, pt.y - h / 2, w, h);
        setImageLoaded(null);
        placedImageRef.current = null;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pt = toCanvas(e);
    if (tool === "paint") {
      const g = ctx();
      g.lineTo(pt.x, pt.y);
      g.stroke();
    } else if (tool === "line" && startPt) {
      restoreBase();
      const g = ctx();
      g.beginPath();
      g.moveTo(startPt.x, startPt.y);
      g.lineTo(pt.x, pt.y);
      g.stroke();
    }
  }

  function onPointerUp() {
    setDrawing(false);
    setStartPt(null);
    if (tool === "line") snapshotBase();
  }

  function onImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      placedImageRef.current = img;
      setImageLoaded(url);
    };
    img.src = url;
    e.target.value = "";
  }

  async function download() {
    setState("processing");
    try {
      bakeText();
      const c = canvasRef.current!;
      const imageData = c.toDataURL("image/jpeg", 0.92);
      const { jsPDF } = await loadJsPDF();
      const doc = new jsPDF({ unit: "px", format: [PAGE_W, PAGE_H], orientation: "portrait" });
      doc.addImage(imageData, "JPEG", 0, 0, PAGE_W, PAGE_H);
      const blob = doc.output("blob");
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`created-${Date.now()}.pdf`);
      setDoneLabel(`Created · ${formatBytes(blob.size)}`);
      setState("done");
    } catch (err) {
      console.error(err);
      setState("error");
    }
  }

  function clearAll() {
    setBoxes([]);
    setSelected(null);
    setEditing(null);
    baseCanvasRef.current = null;
    placedImageRef.current = null;
    setImageLoaded(null);
    resetCanvas();
  }

  function reset() {
    clearAll();
    setTool("paint");
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  function updateBox(id: number, patch: Partial<TextBox>) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function commitEdit() {
    setEditing(null);
    bakeText();
  }

  function removeBox(id: number) {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelected(null);
    setEditing(null);
    bakeText();
  }

  function toggleBold() {
    if (selected === null) return;
    updateBox(selected, { bold: !boxes.find((b) => b.id === selected)?.bold });
    bakeText();
  }
  function toggleUnderline() {
    if (selected === null) return;
    updateBox(selected, { underline: !boxes.find((b) => b.id === selected)?.underline });
    bakeText();
  }

  const activeBox = boxes.find((b) => b.id === selected);

  return (
    <div className="tool">
      <div className="create-toolbar" role="toolbar" aria-label="Drawing tools">
        <button type="button" className={`create-tool${tool === "paint" ? " is-active" : ""}`} onClick={() => setTool("paint")} aria-pressed={tool === "paint"}>
          🖌 Paint
        </button>
        <button type="button" className={`create-tool${tool === "text" ? " is-active" : ""}`} onClick={() => setTool("text")} aria-pressed={tool === "text"}>
          T Text
        </button>
        <button type="button" className={`create-tool${tool === "line" ? " is-active" : ""}`} onClick={() => setTool("line")} aria-pressed={tool === "line"}>
          ╱ Line
        </button>
        <button type="button" className={`create-tool${tool === "image" ? " is-active" : ""}`} onClick={() => setTool("image")} aria-pressed={tool === "image"}>
          🖼 Image
        </button>

        <div className="create-sep" aria-hidden="true" />

        <label className="create-control">
          Color
          <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} />
        </label>
        <label className="create-control">
          Size
          <input type="number" min="1" max="160" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} />
        </label>

        {tool === "text" && selected !== null && (
          <div className="create-text-controls">
            <button type="button" className={`create-tool${activeBox?.bold ? " is-active" : ""}`} onClick={toggleBold} aria-pressed={activeBox?.bold} aria-label="Bold">
              <strong>B</strong>
            </button>
            <button type="button" className={`create-tool${activeBox?.underline ? " is-active" : ""}`} onClick={toggleUnderline} aria-pressed={activeBox?.underline} aria-label="Underline">
              <u>U</u>
            </button>
            {activeBox && (
              <label className="create-control">
                Text size
                <input type="number" min="10" max="160" value={activeBox.size} onChange={(e) => { updateBox(activeBox.id, { size: Number(e.target.value) }); bakeText(); }} />
              </label>
            )}
          </div>
        )}

        <button type="button" className="btn btn--ghost" onClick={clearAll}>
          Clear
        </button>
      </div>

      {tool === "image" && (
        <div className="create-image-tools">
          <button type="button" className="btn btn--secondary" onClick={() => fileInputRef.current?.click()}>
            Choose image
          </button>
          {imageLoaded && <span className="create-image-loaded">Image ready — click the page to place it.</span>}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onImagePicked} className="sr-only" />
        </div>
      )}

      <p className="create-hint">{TOOL_HINTS[tool]}</p>

      <div className="create-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="create-canvas"
          width={PAGE_W}
          height={PAGE_H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: tool === "paint" || tool === "line" ? "crosshair" : "default" }}
        />
        {boxes.map((b) => (
          <div
            key={b.id}
            className={`create-text-box${selected === b.id ? " is-selected" : ""}`}
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setSelected(b.id);
              setTool("text");
            }}
          >
            {editing === b.id ? (
              <input
                autoFocus
                className="create-text-input"
                value={b.text}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                onChange={(e) => updateBox(b.id, { text: e.target.value })}
              />
            ) : (
              <span
                onDoubleClick={() => setEditing(b.id)}
                style={{
                  color: b.color,
                  fontSize: b.size,
                  fontWeight: b.bold ? 700 : 400,
                  textDecoration: b.underline ? "underline" : "none",
                }}
              >
                {b.text}
              </span>
            )}
          </div>
        ))}
      </div>

      {state !== "done" && (
        <button type="button" className="btn btn--primary btn--block create-download" disabled={state === "processing"} onClick={download}>
          {messages.download}
        </button>
      )}

      <ProcessResult messages={messages} state={state} doneLabel={doneLabel} onReset={reset}>
        {state === "done" && downloadUrl && (
          <a className="btn btn--primary" href={downloadUrl} download={filename}>
            {messages.download}
          </a>
        )}
      </ProcessResult>
    </div>
  );
}
