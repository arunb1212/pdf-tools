import { useEffect, useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, tryServerApi } from "@/lib/api";
import { ShieldLockIcon, DownloadIcon, TrashIcon } from "./Icons";

interface Props {
  messages: ToolMessages;
}

export interface RedactionBox {
  id: number;
  page: number; // 1-indexed
  x: number; // [0..1] normalized
  y: number; // [0..1] normalized
  width: number; // [0..1] normalized
  height: number; // [0..1] normalized
  color: "black" | "white" | "slate";
  customText?: string;
}

const DISPLAY_SCALE = 1.3;

export default function HideDataOnPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  // Redactions list
  const [redactions, setRedactions] = useState<RedactionBox[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currentColor, setCurrentColor] = useState<"black" | "white" | "slate">("black");
  const [customText, setCustomText] = useState<string>("");

  // Drawing state (creating new redaction box by dragging)
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Dragging / Moving existing box
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // Process state
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("redacted.pdf");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const accept = "application/pdf,.pdf";

  // Handle PDF upload
  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setRedactions([]);
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
      setRawPdfBytes(new Uint8Array(data.slice(0)));

      const pdf = await pdfjs.getDocument({ data }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
    } catch (err) {
      console.error("PDF load error:", err);
      setState("error");
    }
  }

  // Render current PDF page
  useEffect(() => {
    let active = true;
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: DISPLAY_SCALE });
        const canvas = canvasRef.current;
        if (!canvas || !active) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error("Render page error:", err);
      }
    }
    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum]);

  // When selected box changes, sync toolbar controls
  function selectBox(box: RedactionBox | null) {
    if (box) {
      setSelectedId(box.id);
      setCurrentColor(box.color);
      setCustomText(box.customText || "");
    } else {
      setSelectedId(null);
    }
  }

  // When changing color in toolbar, update both state and currently selected box
  function handleColorChange(color: "black" | "white" | "slate") {
    setCurrentColor(color);
    if (selectedId !== null) {
      setRedactions((prev) =>
        prev.map((b) => (b.id === selectedId ? { ...b, color } : b))
      );
    }
  }

  // When typing label in toolbar, update both state and currently selected box
  function handleLabelChange(text: string) {
    setCustomText(text);
    if (selectedId !== null) {
      setRedactions((prev) =>
        prev.map((b) => (b.id === selectedId ? { ...b, customText: text || undefined } : b))
      );
    }
  }

  // Pointer down on canvas to start drawing a redaction rectangle
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
    selectBox(null);
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDrawCurrent({ x, y });
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawStart) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }

    const endX = drawCurrent ? drawCurrent.x : drawStart.x;
    const endY = drawCurrent ? drawCurrent.y : drawStart.y;

    const left = Math.min(drawStart.x, endX);
    const top = Math.min(drawStart.y, endY);
    let width = Math.abs(endX - drawStart.x);
    let height = Math.abs(endY - drawStart.y);

    // If quick click without drag, create standard redaction bar
    if (width < 0.012 && height < 0.012) {
      width = 0.28;
      height = 0.04;
    }

    const boxX = Math.max(0, Math.min(1 - width, left));
    const boxY = Math.max(0, Math.min(1 - height, top));

    const newId = nextId.current++;
    const newBox: RedactionBox = {
      id: newId,
      page: pageNum,
      x: boxX,
      y: boxY,
      width,
      height,
      color: currentColor,
      customText: customText.trim() || undefined,
    };

    setRedactions((prev) => [...prev, newBox]);
    selectBox(newBox);
    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }

  // Dragging / Moving an existing redaction box
  function handleBoxPointerDown(e: React.PointerEvent<HTMLDivElement>, box: RedactionBox) {
    // Ignore clicks on child buttons (like delete or resize)
    const target = e.target as HTMLElement;
    if (target.closest(".redact-delete-btn") || target.closest(".redact-resize-handle")) {
      return;
    }

    e.stopPropagation();
    selectBox(box);
    setDraggingId(box.id);

    const boxEl = e.currentTarget;
    boxEl.setPointerCapture(e.pointerId);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = box.x;
    const initialY = box.y;

    function onPointerMove(ev: PointerEvent) {
      const deltaX = (ev.clientX - startClientX) / canvasRect.width;
      const deltaY = (ev.clientY - startClientY) / canvasRect.height;

      const newX = Math.max(0, Math.min(1 - box.width, initialX + deltaX));
      const newY = Math.max(0, Math.min(1 - box.height, initialY + deltaY));

      setRedactions((prev) =>
        prev.map((b) => (b.id === box.id ? { ...b, x: newX, y: newY } : b))
      );
    }

    function onPointerUp(ev: PointerEvent) {
      try {
        boxEl.releasePointerCapture(ev.pointerId);
      } catch {}
      boxEl.removeEventListener("pointermove", onPointerMove);
      boxEl.removeEventListener("pointerup", onPointerUp);
      setDraggingId(null);
    }

    boxEl.addEventListener("pointermove", onPointerMove);
    boxEl.addEventListener("pointerup", onPointerUp);
  }

  // Resizing an existing redaction box from the corner handle
  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>, box: RedactionBox) {
    e.stopPropagation();
    selectBox(box);

    const handleEl = e.currentTarget;
    handleEl.setPointerCapture(e.pointerId);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialW = box.width;
    const initialH = box.height;

    function onResizeMove(ev: PointerEvent) {
      const deltaW = (ev.clientX - startClientX) / canvasRect.width;
      const deltaH = (ev.clientY - startClientY) / canvasRect.height;

      const newW = Math.max(0.02, Math.min(1 - box.x, initialW + deltaW));
      const newH = Math.max(0.015, Math.min(1 - box.y, initialH + deltaH));

      setRedactions((prev) =>
        prev.map((b) => (b.id === box.id ? { ...b, width: newW, height: newH } : b))
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

  // Delete a redaction box
  function deleteRedaction(id: number) {
    setRedactions((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Clear all redactions on current page
  function clearCurrentPage() {
    setRedactions((prev) => prev.filter((b) => b.page !== pageNum));
    setSelectedId(null);
  }

  // Quick preset to add a full-width redaction bar
  function addPresetLine() {
    const newId = nextId.current++;
    const newBox: RedactionBox = {
      id: newId,
      page: pageNum,
      x: 0.1,
      y: 0.35,
      width: 0.8,
      height: 0.045,
      color: currentColor,
      customText: customText.trim() || undefined,
    };
    setRedactions((prev) => [...prev, newBox]);
    selectBox(newBox);
  }

  // Permanently burn redactions into PDF using pdf-lib
  async function bake() {
    if (!file || !rawPdfBytes || redactions.length === 0) return;
    setState("processing");

    try {
      const { PDFDocument, rgb, StandardFonts } = await loadPdfLib();
      const doc = await PDFDocument.load(rawPdfBytes.slice(), { ignoreEncryption: true });
      const helveticaFont = await doc.embedFont(StandardFonts.HelveticaBold);
      const pages = doc.getPages();

      // Server-first when the request matches server capabilities (opaque
      // black boxes). White/slate colors and label text are browser-only
      // features, so those stay on the client path below.
      const serverCapable =
        redactions.length > 0 &&
        redactions.every((r) => r.color === "black" && !r.customText?.trim());
      if (serverCapable) {
        try {
          const serverRedactions = redactions.flatMap((red) => {
            if (red.page < 1 || red.page > pages.length) return [];
            const { width: pW, height: pH } = pages[red.page - 1].getSize();
            const w = red.width * pW;
            const h = red.height * pH;
            return [{ page: red.page, x: red.x * pW, y: pH - red.y * pH - h, w, h }];
          });
          const fd = new FormData();
          fd.append("file", file, file.name);
          fd.append("redactions", JSON.stringify(serverRedactions));
          const serverBlob = await tryServerApi(PDF_ENDPOINTS.hideData, fd);
          if (serverBlob && serverBlob.size > 0) {
            const url = URL.createObjectURL(serverBlob);
            if (downloadUrl) URL.revokeObjectURL(downloadUrl);
            setDownloadUrl(url);
            setFilename(`redacted-${file.name.replace(/\.pdf$/i, "")}.pdf`);
            setDoneLabel(
              `Permanently redacted ${redactions.length} area${redactions.length > 1 ? "s" : ""} across ${totalPages} page${totalPages > 1 ? "s" : ""} · via secure server.`
            );
            setState("done");
            return;
          }
        } catch (serverErr) {
          console.warn("Server redaction failed, falling back to browser processing:", serverErr);
        }
      }

      for (const red of redactions) {
        if (red.page < 1 || red.page > pages.length) continue;
        const page = pages[red.page - 1];
        const { width: pWidth, height: pHeight } = page.getSize();

        // Convert normalized coordinates to PDF points (origin is bottom-left in PDF)
        const rectX = red.x * pWidth;
        const rectW = red.width * pWidth;
        const rectH = red.height * pHeight;
        const rectY = pHeight - (red.y * pHeight) - rectH;

        let colorRgb = rgb(0, 0, 0); // Blackout
        let textRgb = rgb(1, 1, 1);
        if (red.color === "white") {
          colorRgb = rgb(1, 1, 1);
          textRgb = rgb(0.2, 0.2, 0.2);
        } else if (red.color === "slate") {
          colorRgb = rgb(0.12, 0.16, 0.24);
          textRgb = rgb(0.9, 0.9, 0.9);
        }

        // Draw solid opaque rectangle permanently covering the area
        page.drawRectangle({
          x: Math.max(0, rectX),
          y: Math.max(0, rectY),
          width: Math.min(pWidth, rectW),
          height: Math.min(pHeight, rectH),
          color: colorRgb,
          opacity: 1,
        });

        // Draw custom label text centered inside the box
        if (red.customText && red.customText.trim()) {
          const text = red.customText.trim();
          let fontSize = Math.min(14, Math.max(5, rectH * 0.65));
          let textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);

          // If text is wider than box, scale font down to fit
          if (textWidth > rectW * 0.92) {
            fontSize = Math.max(4, fontSize * ((rectW * 0.92) / textWidth));
            textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
          }

          const textHeight = fontSize * 0.75;
          page.drawText(text, {
            x: rectX + (rectW - textWidth) / 2,
            y: rectY + (rectH - textHeight) / 2,
            size: fontSize,
            font: helveticaFont,
            color: textRgb,
          });
        }
      }

      const savedBytes = await doc.save();
      const blob = pdfBlob(savedBytes);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFilename(`redacted-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setDoneLabel(
        `Permanently redacted ${redactions.length} area${redactions.length > 1 ? "s" : ""} across ${totalPages} page${totalPages > 1 ? "s" : ""}.`
      );
      setState("done");
    } catch (err) {
      console.error("Redaction bake error:", err);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setRawPdfBytes(null);
    setPdfDoc(null);
    setRedactions([]);
    setSelectedId(null);
    setPageNum(1);
    setTotalPages(0);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  const currentPageRedactions = redactions.filter((r) => r.page === pageNum);
  const selectedBox = redactions.find((r) => r.id === selectedId);

  // Temporary drawing overlay box
  let drawingBox: { left: number; top: number; width: number; height: number } | null = null;
  if (isDrawing && drawStart && drawCurrent) {
    const left = Math.min(drawStart.x, drawCurrent.x) * 100;
    const top = Math.min(drawStart.y, drawCurrent.y) * 100;
    const width = Math.abs(drawCurrent.x - drawStart.x) * 100;
    const height = Math.abs(drawCurrent.y - drawStart.y) * 100;
    drawingBox = { left, top, width, height };
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
        <div className="redact-editor">
          {/* ── 1. REDACTION CONTROLS TOOLBAR ── */}
          <div className="redact-toolbar">
            <div className="redact-toolbar-row">
              {/* Color style options */}
              <div className="redact-colors">
                <span className="redact-label">Color:</span>
                <button
                  type="button"
                  className={`redact-color-btn ${currentColor === "black" ? "is-active" : ""}`}
                  onClick={() => handleColorChange("black")}
                >
                  <span className="redact-swatch redact-swatch--black" />
                  Blackout
                </button>
                <button
                  type="button"
                  className={`redact-color-btn ${currentColor === "white" ? "is-active" : ""}`}
                  onClick={() => handleColorChange("white")}
                >
                  <span className="redact-swatch redact-swatch--white" />
                  Whiteout
                </button>
                <button
                  type="button"
                  className={`redact-color-btn ${currentColor === "slate" ? "is-active" : ""}`}
                  onClick={() => handleColorChange("slate")}
                >
                  <span className="redact-swatch redact-swatch--slate" />
                  Dark Gray
                </button>
              </div>

              {/* Optional label text input */}
              <div className="redact-text-input-wrap">
                <span className="redact-label">Label:</span>
                <input
                  type="text"
                  className="input redact-text-input"
                  placeholder="e.g. [REDACTED]"
                  value={customText}
                  onChange={(e) => handleLabelChange(e.target.value)}
                />
              </div>

              {selectedBox && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  style={{ color: "var(--color-error)", borderColor: "var(--color-error)", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  onClick={() => deleteRedaction(selectedBox.id)}
                >
                  <TrashIcon size={14} />
                  Delete Selected
                </button>
              )}
            </div>

            {/* Navigation & helper buttons */}
            <div className="redact-toolbar-sub">
              <div className="redact-nav">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={pageNum <= 1}
                  onClick={() => setPageNum((p) => p - 1)}
                >
                  ‹ Prev Page
                </button>
                <span className="redact-page-indicator">
                  Page {pageNum} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={pageNum >= totalPages}
                  onClick={() => setPageNum((p) => p + 1)}
                >
                  Next Page ›
                </button>
              </div>

              <div className="redact-quick-actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={addPresetLine}
                  title="Add a full-width blackout bar"
                >
                  + Add Redaction Bar
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={currentPageRedactions.length === 0}
                  onClick={clearCurrentPage}
                >
                  Clear Page
                </button>
              </div>
            </div>
          </div>

          <p className="redact-hint">
            <strong>Click & drag</strong> across text or areas on the document to blackout. Click any box to select and edit its label/color. Use <strong>×</strong> to delete.
          </p>

          {/* ── 2. INTERACTIVE REDACTION CANVAS ── */}
          <div className="redact-workspace">
            <div className="redact-doc-container" ref={containerRef}>
              <canvas
                ref={canvasRef}
                className="redact-page-canvas"
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
              />

              {/* Active drawing preview rectangle */}
              {drawingBox && (
                <div
                  className={`redact-drawing-box redact-box--${currentColor}`}
                  style={{
                    left: `${drawingBox.left}%`,
                    top: `${drawingBox.top}%`,
                    width: `${drawingBox.width}%`,
                    height: `${drawingBox.height}%`,
                  }}
                >
                  {customText.trim() && <span className="redact-box-text">{customText.trim()}</span>}
                </div>
              )}

              {/* Existing redaction boxes on current page */}
              {currentPageRedactions.map((box) => {
                const isSelected = selectedId === box.id;
                const isDragging = draggingId === box.id;
                return (
                  <div
                    key={box.id}
                    className={`redact-box redact-box--${box.color} ${isSelected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                    onPointerDown={(e) => handleBoxPointerDown(e, box)}
                  >
                    {/* Centered label text if set */}
                    {box.customText && (
                      <span className="redact-box-text">{box.customText}</span>
                    )}

                    {/* Delete cross button (handles pointer down directly to bypass parent drag capture) */}
                    <button
                      type="button"
                      className="redact-delete-btn"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        deleteRedaction(box.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRedaction(box.id);
                      }}
                      title="Delete redaction box"
                    >
                      ×
                    </button>

                    {/* Corner resize handle */}
                    <div
                      className="redact-resize-handle"
                      onPointerDown={(e) => handleResizePointerDown(e, box)}
                      title="Drag to resize"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. SUMMARY & DOWNLOAD ── */}
          <div className="redact-footer">
            <div className="redact-stats">
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <ShieldLockIcon size={16} />
                <strong>{redactions.length}</strong> total redaction{redactions.length !== 1 ? "s" : ""} on document ({currentPageRedactions.length} on this page)
              </span>
            </div>

            <button
              type="button"
              className="btn btn--primary btn--block redact-download-btn"
              disabled={state === "processing" || redactions.length === 0}
              onClick={bake}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              <DownloadIcon size={18} />
              {state === "processing"
                ? messages.processing
                : redactions.length === 0
                ? "Draw a redaction box above to download"
                : "Apply Permanent Redactions & Download PDF"}
            </button>
          </div>

          <p className="legal-note" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldLockIcon size={16} />
            <span>
              <strong>100% Client-Side Privacy:</strong> All redactions are applied directly in your browser. Sensitive contents are permanently covered before download, and your files are never uploaded to any server.
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
