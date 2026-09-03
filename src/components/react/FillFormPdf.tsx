import React, { useEffect, useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import {
  DocumentIcon,
  ShieldLockIcon,
  PenToolIcon,
  TextIcon,
  CheckIcon,
  CloseIcon,
  CalendarIcon,
  DownloadIcon,
  TrashIcon,
  ImageIcon,
  CursorClickIcon,
  MoveIcon,
  MaximizeIcon,
  MinimizeIcon,
} from "./Icons";

interface Props {
  messages: ToolMessages;
  locale?: string;
}

export type FormTool = "text" | "check" | "cross" | "date" | "sign" | "select";

export interface FormItem {
  id: number;
  type: "text" | "check" | "cross" | "date" | "sign";
  page: number; // 1-indexed
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
  width: number; // normalized [0..1]
  height: number; // normalized [0..1]
  text?: string;
  fontSize?: number;
  color?: string;
  isBold?: boolean;
  sigUrl?: string;
  sigBytes?: Uint8Array;
}

const DISPLAY_SCALE = 1.4;

export default function FillFormPdf({ messages, locale = "en" }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  // Form Tool Mode
  const [activeTool, setActiveTool] = useState<FormTool>("text");

  // All placed form annotations
  const [items, setItems] = useState<FormItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Text Tool Settings
  const [inputText, setInputText] = useState("John Doe");
  const [fontSize, setFontSize] = useState(14);
  const [fontColor, setFontColor] = useState("#121111"); // default black ink
  const [isBold, setIsBold] = useState(false);

  // Date Tool Settings
  const todayIso = new Date().toISOString().slice(0, 10);
  const [dateText, setDateText] = useState(todayIso);

  // Signature Tool Settings
  const [sigMode, setSigMode] = useState<"draw" | "type" | "upload">("draw");
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigBytes, setSigBytes] = useState<Uint8Array | null>(null);
  const [typedSig, setTypedSig] = useState("");
  const [typedSigFont, setTypedSigFont] = useState("cursive");

  // Interaction dragging / moving state
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // Detect interactive AcroForms
  const [acroFieldCount, setAcroFieldCount] = useState<number | null>(null);

  // Process / Export state
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("filled-form.pdf");

  // Zoom & Fullscreen
  const [zoom, setZoom] = useState(1.85);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Keyboard shortcut: Esc to exit fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Refs
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawSigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const accept = "application/pdf,.pdf";

  // Handle PDF Upload
  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setItems([]);
    setSelectedId(null);
    setPageNum(1);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerUrl = await import("pdfjs-dist/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;

      const data = await f.arrayBuffer();
      const bytes = new Uint8Array(data.slice(0));
      setRawPdfBytes(bytes);

      const pdf = await pdfjs.getDocument({ data }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);

      // Check for interactive AcroForm fields
      try {
        const { PDFDocument } = await loadPdfLib();
        const testDoc = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
        const form = testDoc.getForm();
        const fields = form.getFields();
        setAcroFieldCount(fields.length);
      } catch {
        setAcroFieldCount(0);
      }
    } catch (err) {
      console.error("PDF form load error:", err);
      setState("error");
    }
  }

  // Render Page to Canvas
  useEffect(() => {
    let active = true;
    async function renderPage() {
      if (!pdfDoc || !pageCanvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: zoom });
        const canvas = pageCanvasRef.current;
        if (!canvas || !active) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error("Render form page error:", err);
      }
    }
    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum, zoom]);

  // Click on Canvas to Drop Form Elements
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = pageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (activeTool === "select") {
      setSelectedId(null);
      return;
    }

    const newId = nextId.current++;

    if (activeTool === "text") {
      const newItem: FormItem = {
        id: newId,
        type: "text",
        page: pageNum,
        x: Math.max(0, Math.min(0.85, x)),
        y: Math.max(0, Math.min(0.95, y - 0.015)),
        width: 0.28,
        height: 0.038,
        text: inputText.trim() || "Text",
        fontSize: fontSize,
        color: fontColor,
        isBold: isBold,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(newId);
    } else if (activeTool === "check") {
      const newItem: FormItem = {
        id: newId,
        type: "check",
        page: pageNum,
        x: Math.max(0, x - 0.012),
        y: Math.max(0, y - 0.015),
        width: 0.035,
        height: 0.035,
        color: fontColor,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(newId);
    } else if (activeTool === "cross") {
      const newItem: FormItem = {
        id: newId,
        type: "cross",
        page: pageNum,
        x: Math.max(0, x - 0.012),
        y: Math.max(0, y - 0.015),
        width: 0.035,
        height: 0.035,
        color: fontColor,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(newId);
    } else if (activeTool === "date") {
      const newItem: FormItem = {
        id: newId,
        type: "date",
        page: pageNum,
        x: Math.max(0, Math.min(0.85, x)),
        y: Math.max(0, Math.min(0.95, y - 0.015)),
        width: 0.22,
        height: 0.035,
        text: dateText || todayIso,
        fontSize: fontSize,
        color: fontColor,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(newId);
    } else if (activeTool === "sign" && sigUrl) {
      const newItem: FormItem = {
        id: newId,
        type: "sign",
        page: pageNum,
        x: Math.max(0, x - 0.1),
        y: Math.max(0, y - 0.04),
        width: 0.22,
        height: 0.075,
        sigUrl: sigUrl,
        sigBytes: sigBytes || undefined,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(newId);
    }
  }

  // Pointer Down for Dragging Form Items
  function handleItemPointerDown(e: React.PointerEvent<HTMLDivElement>, item: FormItem) {
    const target = e.target as HTMLElement;
    if (target.closest(".form-item-delete") || target.closest(".form-item-resize")) {
      return;
    }

    e.stopPropagation();
    setSelectedId(item.id);
    setDraggingId(item.id);

    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}

    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = item.x;
    const initialY = item.y;

    function onPointerMove(ev: PointerEvent) {
      const deltaX = (ev.clientX - startClientX) / canvasRect.width;
      const deltaY = (ev.clientY - startClientY) / canvasRect.height;

      const newX = Math.max(0, Math.min(1 - item.width, initialX + deltaX));
      const newY = Math.max(0, Math.min(1 - item.height, initialY + deltaY));

      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, x: newX, y: newY } : it))
      );
    }

    function onPointerUp(ev: PointerEvent) {
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {}
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      setDraggingId(null);
    }

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
  }

  // Corner Resize
  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>, item: FormItem) {
    e.stopPropagation();
    setSelectedId(item.id);

    const handleEl = e.currentTarget;
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {}

    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialW = item.width;
    const initialH = item.height;

    function onResizeMove(ev: PointerEvent) {
      const deltaW = (ev.clientX - startClientX) / canvasRect.width;
      const deltaH = (ev.clientY - startClientY) / canvasRect.height;

      const newW = Math.max(0.02, Math.min(1 - item.x, initialW + deltaW));
      const newH = Math.max(0.015, Math.min(1 - item.y, initialH + deltaH));

      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, width: newW, height: newH } : it))
      );
    }

    function onResizeUp(ev: PointerEvent) {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onResizeMove);
      handleEl.removeEventListener("pointerup", onResizeUp);
    }

    handleEl.addEventListener("pointermove", onResizeMove);
    handleEl.addEventListener("pointerup", onResizeUp);
  }

  function deleteItem(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Signature Draw Logic
  const isDrawingSig = useRef(false);
  function startDrawSig(e: React.PointerEvent<HTMLCanvasElement>) {
    isDrawingSig.current = true;
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = fontColor;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function moveDrawSig(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingSig.current) return;
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function endDrawSig() {
    if (!isDrawingSig.current) return;
    isDrawingSig.current = false;
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setSigUrl(url);
      setSigBytes(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  }

  function clearDrawSig() {
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigUrl(null);
    setSigBytes(null);
  }

  function generateTypedSignature(name: string, font: string) {
    if (!name.trim()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fontColor;

    let fontSpec = "italic 48px 'Brush Script MT', cursive";
    if (font === "brush") fontSpec = "italic 44px 'Segoe Script', cursive";
    if (font === "serif") fontSpec = "italic 40px Georgia, serif";

    ctx.font = fontSpec;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setSigUrl(url);
      setSigBytes(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  }

  // Bake & Export Filled Form PDF
  // NOTE: intentionally browser-only. This editor bakes free-floating visual
  // annotations (text/check/cross/date/signature overlays at normalized
  // coordinates), which the server's /api/v1/fill-form endpoint cannot
  // reproduce — it fills named AcroForm fields from JSON key-values.
  // Routing these overlays server-side would silently drop them.
  async function bakeForm() {
    if (!file || !rawPdfBytes) return;
    setState("processing");

    try {
      const { PDFDocument, rgb, StandardFonts } = await loadPdfLib();
      const doc = await PDFDocument.load(rawPdfBytes.slice(), { ignoreEncryption: true });
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const zapfDingbats = await doc.embedFont(StandardFonts.ZapfDingbats);
      const pages = doc.getPages();

      for (const item of items) {
        if (item.page < 1 || item.page > pages.length) continue;
        const page = pages[item.page - 1];
        const { width: pWidth, height: pHeight } = page.getSize();

        const rectX = item.x * pWidth;
        const rectW = item.width * pWidth;
        const rectH = item.height * pHeight;
        const rectY = pHeight - item.y * pHeight - rectH;

        // Parse hex color
        let r = 0.07,
          g = 0.07,
          b = 0.07;
        if (item.color && item.color.startsWith("#") && item.color.length === 7) {
          r = parseInt(item.color.slice(1, 3), 16) / 255;
          g = parseInt(item.color.slice(3, 5), 16) / 255;
          b = parseInt(item.color.slice(5, 7), 16) / 255;
        }

        if (item.type === "text" || item.type === "date") {
          const content = item.text || "";
          const fSize = item.fontSize || 14;
          page.drawText(content, {
            x: rectX,
            y: rectY + rectH * 0.25,
            size: fSize,
            font: item.isBold ? helveticaBold : helvetica,
            color: rgb(r, g, b),
          });
        } else if (item.type === "check") {
          // Draw checkmark using standard checkmark character or ZapfDingbats
          const fSize = Math.max(12, rectH * 0.9);
          try {
            page.drawText("4", {
              // '4' in ZapfDingbats is a checkmark
              x: rectX + rectW * 0.15,
              y: rectY + rectH * 0.15,
              size: fSize,
              font: zapfDingbats,
              color: rgb(r, g, b),
            });
          } catch {
            page.drawText("✓", {
              x: rectX,
              y: rectY,
              size: fSize,
              font: helveticaBold,
              color: rgb(r, g, b),
            });
          }
        } else if (item.type === "cross") {
          const fSize = Math.max(12, rectH * 0.9);
          try {
            page.drawText("6", {
              // '6' in ZapfDingbats is an X
              x: rectX + rectW * 0.15,
              y: rectY + rectH * 0.15,
              size: fSize,
              font: zapfDingbats,
              color: rgb(r, g, b),
            });
          } catch {
            page.drawText("✕", {
              x: rectX,
              y: rectY,
              size: fSize,
              font: helveticaBold,
              color: rgb(r, g, b),
            });
          }
        } else if (item.type === "sign" && item.sigBytes) {
          try {
            const pngImage = await doc.embedPng(item.sigBytes);
            page.drawImage(pngImage, {
              x: rectX,
              y: rectY,
              width: rectW,
              height: rectH,
            });
          } catch (err) {
            console.warn("Signature embedding error:", err);
          }
        }
      }

      const savedBytes = await doc.save();
      const blob = pdfBlob(savedBytes);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFilename(`filled-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setDoneLabel(`Completed form with ${items.length} filled entries ready for download.`);
      setState("done");
    } catch (err) {
      console.error("Bake form error:", err);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setRawPdfBytes(null);
    setPdfDoc(null);
    setItems([]);
    setSelectedId(null);
    setPageNum(1);
    setTotalPages(0);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  const currentPageItems = items.filter((it) => it.page === pageNum);
  const selectedItem = items.find((it) => it.id === selectedId);

  return (
    <div className="tool form-filler-tool">
      <FileDropzone
        accept={accept}
        onFiles={handleFiles}
        busy={state === "processing"}
        messages={messages}
        hint="PDF Form or Application"
      />

      {file && (
        <div className={`form-filler-app ${isFullscreen ? "is-fullscreen" : ""}`}>
          {/* ── 1. UNIFIED SLIM HEADER (SINGLE ROW) ── */}
          <div className="form-unified-bar">
            <div className="form-bar-left">
              <DocumentIcon size={16} />
              <span className="form-bar-title" title={file.name}>
                {file.name}
              </span>
              <div className="form-pagination-pill">
                <button
                  type="button"
                  className="form-mini-btn"
                  disabled={pageNum <= 1}
                  onClick={() => {
                    setPageNum((p) => p - 1);
                    setSelectedId(null);
                  }}
                  title="Previous Page"
                >
                  ‹
                </button>
                <span className="form-page-num">{pageNum} / {totalPages}</span>
                <button
                  type="button"
                  className="form-mini-btn"
                  disabled={pageNum >= totalPages}
                  onClick={() => {
                    setPageNum((p) => p + 1);
                    setSelectedId(null);
                  }}
                  title="Next Page"
                >
                  ›
                </button>
              </div>
            </div>

            {/* Central Tool Switcher (Segmented Control) */}
            <div className="form-segmented-tools" role="tablist">
              <button
                type="button"
                className={`form-tool-tab ${activeTool === "text" ? "is-active" : ""}`}
                onClick={() => setActiveTool("text")}
              >
                <TextIcon size={14} />
                <span>Text</span>
              </button>

              <button
                type="button"
                className={`form-tool-tab ${activeTool === "check" ? "is-active" : ""}`}
                onClick={() => setActiveTool("check")}
              >
                <CheckIcon size={14} />
                <span>Check (✓)</span>
              </button>

              <button
                type="button"
                className={`form-tool-tab ${activeTool === "cross" ? "is-active" : ""}`}
                onClick={() => setActiveTool("cross")}
              >
                <CloseIcon size={14} />
                <span>Cross (✕)</span>
              </button>

              <button
                type="button"
                className={`form-tool-tab ${activeTool === "date" ? "is-active" : ""}`}
                onClick={() => setActiveTool("date")}
              >
                <CalendarIcon size={14} />
                <span>Date</span>
              </button>

              <button
                type="button"
                className={`form-tool-tab ${activeTool === "sign" ? "is-active" : ""}`}
                onClick={() => setActiveTool("sign")}
              >
                <PenToolIcon size={14} />
                <span>Sign</span>
              </button>

              <button
                type="button"
                className={`form-tool-tab ${activeTool === "select" ? "is-active" : ""}`}
                onClick={() => setActiveTool("select")}
              >
                <CursorClickIcon size={14} />
                <span>Select</span>
              </button>
            </div>

            {/* Right: Zoom, Fullscreen, Export */}
            <div className="form-bar-right">
              <div className="form-zoom-pill">
                <button
                  type="button"
                  className="form-mini-btn"
                  disabled={zoom <= 1.0}
                  onClick={() => setZoom((z) => Math.max(1.0, Number((z - 0.25).toFixed(2))))}
                  title="Zoom Out"
                >
                  -
                </button>
                <button
                  type="button"
                  className="form-zoom-val-btn"
                  onClick={() => setZoom((z) => (z > 2.0 ? 1.85 : 2.4))}
                  title="Toggle Zoom / Fit"
                >
                  {Math.round((zoom / 1.85) * 100)}%
                </button>
                <button
                  type="button"
                  className="form-mini-btn"
                  disabled={zoom >= 3.2}
                  onClick={() => setZoom((z) => Math.min(3.2, Number((z + 0.25).toFixed(2))))}
                  title="Zoom In"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className={`form-icon-action-btn ${isFullscreen ? "is-active" : ""}`}
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Mode"}
              >
                {isFullscreen ? <MinimizeIcon size={15} /> : <MaximizeIcon size={15} />}
              </button>

              <button
                type="button"
                className="btn btn--primary btn--sm form-export-btn"
                disabled={state === "processing"}
                onClick={bakeForm}
              >
                <DownloadIcon size={14} />
                <span>{state === "processing" ? messages.processing : "Export PDF"}</span>
              </button>
            </div>
          </div>

          {/* ── 2. CONTEXTUAL COMPACT STRIP (ONLY ACTIVE TOOL OPTIONS) ── */}
          <div className="form-context-strip">
            {activeTool === "text" && (
              <div className="form-context-inner">
                <input
                  type="text"
                  className="form-clean-input"
                  placeholder="Type name, address, or details..."
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (selectedItem && selectedItem.type === "text") {
                      setItems((prev) =>
                        prev.map((it) => (it.id === selectedItem.id ? { ...it, text: e.target.value } : it))
                      );
                    }
                  }}
                />

                <div className="form-font-size-control">
                  <button
                    type="button"
                    className="form-size-chip"
                    onClick={() => {
                      const next = Math.max(9, fontSize - 2);
                      setFontSize(next);
                      if (selectedItem && (selectedItem.type === "text" || selectedItem.type === "date")) {
                        setItems((prev) => prev.map((it) => (it.id === selectedItem.id ? { ...it, fontSize: next } : it)));
                      }
                    }}
                    title="Smaller"
                  >
                    -
                  </button>
                  <span className="form-size-val">{fontSize}pt</span>
                  <button
                    type="button"
                    className="form-size-chip"
                    onClick={() => {
                      const next = Math.min(36, fontSize + 2);
                      setFontSize(next);
                      if (selectedItem && (selectedItem.type === "text" || selectedItem.type === "date")) {
                        setItems((prev) => prev.map((it) => (it.id === selectedItem.id ? { ...it, fontSize: next } : it)));
                      }
                    }}
                    title="Larger"
                  >
                    +
                  </button>
                </div>

                <div className="form-color-chips">
                  <button
                    type="button"
                    className={`form-ink-dot ${fontColor === "#121111" ? "is-active" : ""}`}
                    onClick={() => setFontColor("#121111")}
                    style={{ background: "#121111" }}
                    title="Black ink"
                  />
                  <button
                    type="button"
                    className={`form-ink-dot ${fontColor === "#1e3a8a" ? "is-active" : ""}`}
                    onClick={() => setFontColor("#1e3a8a")}
                    style={{ background: "#1e3a8a" }}
                    title="Blue ink"
                  />
                </div>

                <button
                  type="button"
                  className={`form-bold-btn ${isBold ? "is-active" : ""}`}
                  onClick={() => setIsBold(!isBold)}
                  title="Bold"
                >
                  B
                </button>

                <span className="form-quick-tip">Click on any line to place text</span>
              </div>
            )}

            {(activeTool === "check" || activeTool === "cross") && (
              <div className="form-context-inner">
                <span className="form-context-label">Ink:</span>
                <div className="form-color-chips">
                  <button
                    type="button"
                    className={`form-ink-dot ${fontColor === "#121111" ? "is-active" : ""}`}
                    onClick={() => setFontColor("#121111")}
                    style={{ background: "#121111" }}
                    title="Black"
                  />
                  <button
                    type="button"
                    className={`form-ink-dot ${fontColor === "#1e3a8a" ? "is-active" : ""}`}
                    onClick={() => setFontColor("#1e3a8a")}
                    style={{ background: "#1e3a8a" }}
                    title="Blue"
                  />
                </div>
                <span className="form-quick-tip">Click on any box to stamp {activeTool === "check" ? "✓" : "✕"}</span>
              </div>
            )}

            {activeTool === "date" && (
              <div className="form-context-inner">
                <input
                  type="text"
                  className="form-clean-input form-date-input"
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setDateText(todayIso)}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setDateText(new Date().toLocaleDateString(locale === "de" ? "de-DE" : "en-US"))}
                >
                  Formatted
                </button>
                <span className="form-quick-tip">Click on the "Date:" line to place</span>
              </div>
            )}

            {activeTool === "sign" && (
              <div className="form-context-inner form-sign-context">
                <div className="form-sign-pill-tabs">
                  <button
                    type="button"
                    className={`form-sign-pill ${sigMode === "draw" ? "is-active" : ""}`}
                    onClick={() => setSigMode("draw")}
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    className={`form-sign-pill ${sigMode === "type" ? "is-active" : ""}`}
                    onClick={() => setSigMode("type")}
                  >
                    Type
                  </button>
                  <button
                    type="button"
                    className={`form-sign-pill ${sigMode === "upload" ? "is-active" : ""}`}
                    onClick={() => setSigMode("upload")}
                  >
                    Upload
                  </button>
                </div>

                {sigMode === "draw" && (
                  <div className="form-draw-compact">
                    <canvas
                      ref={drawSigCanvasRef}
                      className="form-sig-canvas-compact"
                      width={220}
                      height={40}
                      onPointerDown={startDrawSig}
                      onPointerMove={moveDrawSig}
                      onPointerUp={endDrawSig}
                    />
                    <button type="button" className="btn btn--secondary btn--sm" onClick={clearDrawSig}>
                      Clear
                    </button>
                  </div>
                )}

                {sigMode === "type" && (
                  <div className="form-type-compact">
                    <input
                      type="text"
                      className="form-clean-input"
                      placeholder="Type your name..."
                      value={typedSig}
                      onChange={(e) => {
                        setTypedSig(e.target.value);
                        generateTypedSignature(e.target.value, typedSigFont);
                      }}
                    />
                    <button
                      type="button"
                      className={`form-font-pill ${typedSigFont === "cursive" ? "is-active" : ""}`}
                      onClick={() => {
                        setTypedSigFont("cursive");
                        generateTypedSignature(typedSig || "Signature", "cursive");
                      }}
                    >
                      Script
                    </button>
                    <button
                      type="button"
                      className={`form-font-pill ${typedSigFont === "brush" ? "is-active" : ""}`}
                      onClick={() => {
                        setTypedSigFont("brush");
                        generateTypedSignature(typedSig || "Signature", "brush");
                      }}
                    >
                      Brush
                    </button>
                  </div>
                )}

                {sigMode === "upload" && (
                  <div className="form-upload-compact">
                    <input
                      ref={sigFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = URL.createObjectURL(f);
                        setSigUrl(url);
                        setSigBytes(new Uint8Array(await f.arrayBuffer()));
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => sigFileInputRef.current?.click()}
                    >
                      Choose Image
                    </button>
                  </div>
                )}

                {sigUrl && (
                  <div className="form-ready-badge">
                    <img src={sigUrl} alt="Signature" />
                    <span>Click on line to place signature</span>
                  </div>
                )}
              </div>
            )}

            {activeTool === "select" && (
              <div className="form-context-inner">
                <span className="form-quick-tip">Click and drag any placed item to reposition or resize</span>
                {selectedItem && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ color: "var(--color-error)", borderColor: "var(--color-error)" }}
                    onClick={() => deleteItem(selectedItem.id)}
                  >
                    Delete Selected
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── 3. LIVE INTERACTIVE FORM CANVAS ── */}
          <div className="form-workspace-viewport">
            <div className="form-doc-container" ref={containerRef}>
              <canvas
                ref={pageCanvasRef}
                className="form-page-canvas"
                onClick={handleCanvasClick}
                style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
              />

              {/* Placed Form Annotations */}
              {currentPageItems.map((item) => {
                const isSelected = selectedId === item.id;
                const isDragging = draggingId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`form-item-overlay ${isSelected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`}
                    style={{
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: `${item.width * 100}%`,
                      height: `${item.height * 100}%`,
                    }}
                    onPointerDown={(e) => handleItemPointerDown(e, item)}
                  >
                    {/* Render Text or Date */}
                    {(item.type === "text" || item.type === "date") && (
                      <span
                        className="form-item-text"
                        style={{
                          color: item.color,
                          fontSize: `${(item.fontSize || 14) * 1.05}px`,
                          fontWeight: item.isBold ? 700 : 500,
                        }}
                      >
                        {item.text}
                      </span>
                    )}

                    {/* Render Checkmark */}
                    {item.type === "check" && (
                      <span className="form-item-symbol" style={{ color: item.color || "#121111" }}>
                        ✓
                      </span>
                    )}

                    {/* Render Cross */}
                    {item.type === "cross" && (
                      <span className="form-item-symbol" style={{ color: item.color || "#121111" }}>
                        ✕
                      </span>
                    )}

                    {/* Render Signature */}
                    {item.type === "sign" && item.sigUrl && (
                      <img src={item.sigUrl} alt="Signature" className="form-item-sig-img" />
                    )}

                    {/* Clean Minimalist Floating Delete Button (Only shown when selected) */}
                    {isSelected && (
                      <button
                        type="button"
                        className="form-floating-del-btn"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          deleteItem(item.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteItem(item.id);
                        }}
                        title="Delete item"
                      >
                        <CloseIcon size={12} />
                      </button>
                    )}

                    {/* Corner resize handle (Only shown when selected) */}
                    {isSelected && (
                      <div
                        className="form-item-resize"
                        onPointerDown={(e) => handleResizePointerDown(e, item)}
                        title="Resize"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-footer-summary">
            <span>
              🔒 <strong>{items.length}</strong> field{items.length !== 1 ? "s" : ""} filled on document.
            </span>
          </div>

          <p className="legal-note" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldLockIcon size={16} />
            <span>
              <strong>100% Client-Side Privacy:</strong> All form text, checkmarks, and signatures are processed locally in your browser. Your private form information is never uploaded or saved to any external servers.
            </span>
          </p>
        </div>
      )}

      {state === "done" && downloadUrl && (
        <ProcessResult
          messages={messages}
          state={state}
          doneLabel={doneLabel}
          onReset={reset}
        >
          <a className="btn btn--primary" href={downloadUrl} download={filename}>
            {messages.download}
          </a>
        </ProcessResult>
      )}

      {state === "error" && (
        <ProcessResult
          messages={messages}
          state={state}
          doneLabel={null}
          onReset={reset}
        />
      )}
    </div>
  );
}
