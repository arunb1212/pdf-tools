import { useEffect, useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadPdfJs, loadPdfLib, loadJsPDF, pdfBlob, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

type Mode = "draw" | "type" | "upload" | "camera";

const DISPLAY_SCALE = 1.5;

// Extract signature ink from white paper background
function extractSignatureFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  threshold: number = 205,
  inkColor: string = "original"
): string {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasStrokes = false;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Perceived brightness
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    if (luminance < threshold) {
      // It's ink!
      const delta = threshold - luminance;
      const alpha = Math.min(255, Math.round((delta / 45) * 255));

      if (inkColor === "black") {
        data[i] = 18;
        data[i + 1] = 18;
        data[i + 2] = 24;
      } else if (inkColor === "blue") {
        data[i] = 12;
        data[i + 1] = 55;
        data[i + 2] = 165;
      } else {
        data[i] = Math.max(0, r - 35);
        data[i + 1] = Math.max(0, g - 35);
        data[i + 2] = Math.max(0, b - 35);
      }
      data[i + 3] = Math.max(180, alpha);

      const pixelIdx = i / 4;
      const px = pixelIdx % w;
      const py = Math.floor(pixelIdx / w);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      hasStrokes = true;
    } else {
      // White paper -> transparent
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Auto-crop to bounding box of signature
  if (hasStrokes && maxX > minX && maxY > minY) {
    const pad = 16;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(w - cropX, (maxX - minX) + pad * 2);
    const cropH = Math.min(h - cropY, (maxY - minY) + pad * 2);

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const cropCtx = croppedCanvas.getContext("2d")!;
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return croppedCanvas.toDataURL("image/png");
  }

  return canvas.toDataURL("image/png");
}

// Convert base64 data URL to Uint8Array
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function SignPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null);
  const [mode, setMode] = useState<Mode>("draw");

  // Draw state
  const drawRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawColor, setDrawColor] = useState("#121111");

  // Type state
  const [typed, setTyped] = useState("");
  const [selectedFont, setSelectedFont] = useState<"cursive" | "serif" | "brush">("cursive");

  // Upload & Camera state
  const [rawImageCanvas, setRawImageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [threshold, setThreshold] = useState<number>(205);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signature and placement
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [sigScale, setSigScale] = useState<number>(28); // % of page width
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);
  const [placedPage, setPlacedPage] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);

  // PDF Preview and document
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);

  // Tool state
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("signed.pdf");

  const accept = "application/pdf,.pdf";

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  // Handle PDF document upload
  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setPageNum(1);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);

    try {
      const arrayBuf = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      setRawPdfBytes(bytes);

      const pdfjs = await loadPdfJs();
      // Pass a clone of the byte buffer to prevent worker detachment
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setPlaced({ x: 0.5, y: 0.75 });
      setPlacedPage(1);
    } catch (err) {
      console.error("PDF load error:", err);
      setState("error");
    }
  }

  // Render current PDF page to preview canvas
  useEffect(() => {
    let active = true;
    async function renderPage() {
      if (!pdfDoc || !pageCanvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: DISPLAY_SCALE });
        const canvas = pageCanvasRef.current;
        if (!canvas || !active) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error("Failed to render PDF page:", err);
      }
    }
    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum]);

  // --- Draw Mode Handlers ---
  function initDrawCanvas() {
    const canvas = drawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = drawColor;
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    drawing.current = true;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height)
    );
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height)
    );
    ctx.stroke();
  }

  function endDraw() {
    drawing.current = false;
    const canvas = drawRef.current;
    if (canvas) {
      setSignatureUrl(canvas.toDataURL("image/png"));
      if (!placed) {
        setPlaced({ x: 0.5, y: 0.75 });
        setPlacedPage(pageNum);
      }
    }
  }

  // --- Type Mode Handler ---
  function generateTypedSignature(text: string, fontType: "cursive" | "serif" | "brush") {
    if (!text.trim()) return;
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 180;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = drawColor;

    let fontStyle = "italic 52px 'Brush Script MT', 'Dancing Script', cursive";
    if (fontType === "serif") {
      fontStyle = "italic 46px Georgia, 'Times New Roman', serif";
    } else if (fontType === "brush") {
      fontStyle = "italic bold 48px 'Segoe Script', 'Snell Roundhand', cursive";
    }

    ctx.font = fontStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2);
    setSignatureUrl(c.toDataURL("image/png"));
    if (!placed) {
      setPlaced({ x: 0.5, y: 0.75 });
      setPlacedPage(pageNum);
    }
  }

  // --- Upload / Paper Extraction Handlers ---
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const c = document.createElement("canvas");
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        setRawImageCanvas(c);
        const extracted = extractSignatureFromCanvas(c, threshold);
        setSignatureUrl(extracted);
        if (!placed) {
          setPlaced({ x: 0.5, y: 0.75 });
          setPlacedPage(pageNum);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(imgFile);
  }

  // --- Camera Handlers ---
  async function startCamera() {
    setCameraError(null);
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError("Camera permission denied or camera not found. Please check permissions or use image upload.");
      setCameraActive(false);
    }
  }

  function captureCameraSnapshot() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;

    const c = document.createElement("canvas");
    c.width = video.videoWidth || 640;
    c.height = video.videoHeight || 480;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, c.width, c.height);

    stopCamera();
    setRawImageCanvas(c);
    const extracted = extractSignatureFromCanvas(c, threshold);
    setSignatureUrl(extracted);
    if (!placed) {
      setPlaced({ x: 0.5, y: 0.75 });
      setPlacedPage(pageNum);
    }
  }

  // Re-extract if threshold slider changes
  function updateThreshold(val: number) {
    setThreshold(val);
    if (rawImageCanvas) {
      const extracted = extractSignatureFromCanvas(rawImageCanvas, val);
      setSignatureUrl(extracted);
    }
  }

  // --- Interactive PDF Click & Drag Placement ---
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!signatureUrl || isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const halfWidthRatio = (sigScale / 100) / 2;
    const halfHeightRatio = halfWidthRatio * 0.45;
    
    setPlaced({
      x: Math.max(halfWidthRatio, Math.min(1 - halfWidthRatio, x)),
      y: Math.max(halfHeightRatio, Math.min(1 - halfHeightRatio, y)),
    });
    setPlacedPage(pageNum);
  }

  // Drag signature box directly on PDF document
  function handleMarkerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const marker = e.currentTarget;
    marker.setPointerCapture(e.pointerId);
    setIsDragging(true);

    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = placed ? placed.x : 0.5;
    const initialY = placed ? placed.y : 0.75;

    const halfW = (markerRect.width / 2) / canvasRect.width;
    const halfH = (markerRect.height / 2) / canvasRect.height;

    function onPointerMove(ev: PointerEvent) {
      const deltaX = (ev.clientX - startClientX) / canvasRect.width;
      const deltaY = (ev.clientY - startClientY) / canvasRect.height;

      const rawX = initialX + deltaX;
      const rawY = initialY + deltaY;

      const clampedX = Math.max(halfW, Math.min(1 - halfW, rawX));
      const clampedY = Math.max(halfH, Math.min(1 - halfH, rawY));

      setPlaced({ x: clampedX, y: clampedY });
      setPlacedPage(pageNum);
    }

    function onPointerUp(ev: PointerEvent) {
      marker.releasePointerCapture(ev.pointerId);
      marker.removeEventListener("pointermove", onPointerMove);
      marker.removeEventListener("pointerup", onPointerUp);
      setTimeout(() => setIsDragging(false), 50);
    }

    marker.addEventListener("pointermove", onPointerMove);
    marker.addEventListener("pointerup", onPointerUp);
  }

  // Resize handle dragging
  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const startClientX = e.clientX;
    const initialScale = sigScale;

    function onResizeMove(ev: PointerEvent) {
      const deltaPercent = ((ev.clientX - startClientX) / canvasRect.width) * 100 * 2;
      const newScale = Math.max(10, Math.min(75, initialScale + deltaPercent));
      setSigScale(Math.round(newScale));
    }

    function onResizeUp(ev: PointerEvent) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onResizeMove);
      handle.removeEventListener("pointerup", onResizeUp);
    }

    handle.addEventListener("pointermove", onResizeMove);
    handle.addEventListener("pointerup", onResizeUp);
  }

  // --- Save / Bake with reliable PDF generator ---
  async function bake() {
    if (!file || !signatureUrl) return;
    setState("processing");
    try {
      const sigPngBytes = dataUrlToBytes(signatureUrl);

      // 1. Vector embedding with pdf-lib
      try {
        const { PDFDocument } = await loadPdfLib();
        const sourceBytes = rawPdfBytes ? rawPdfBytes.slice() : new Uint8Array(await file.arrayBuffer());
        const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });

        const pages = doc.getPages();
        const targetIndex = Math.max(0, Math.min(placedPage - 1, pages.length - 1));
        const targetPage = pages[targetIndex];
        const { width, height } = targetPage.getSize();

        const sigImage = await doc.embedPng(sigPngBytes);
        const sigW = width * (sigScale / 100);
        const sigH = sigW * (sigImage.height / sigImage.width);

        const posX = placed ? placed.x : 0.5;
        const posY = placed ? placed.y : 0.75;

        const x = Math.max(0, Math.min(width - sigW, posX * width - sigW / 2));
        const y = Math.max(0, Math.min(height - sigH, height - posY * height - sigH / 2));

        targetPage.drawImage(sigImage, {
          x,
          y,
          width: sigW,
          height: sigH,
        });

        const savedBytes = await doc.save();
        const blob = pdfBlob(savedBytes);
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setFilename(`signed-${file.name.replace(/\.pdf$/i, "")}.pdf`);
        setDoneLabel(`Signature successfully applied to page ${placedPage} of ${pages.length}`);
        setState("done");
        return;
      } catch (pdfLibErr) {
        console.warn("pdf-lib direct embed encountered an issue, falling back to raster:", pdfLibErr);
      }

      // 2. Fallback rendering with jsPDF
      const pdfjs = await loadPdfJs();
      const { jsPDF } = await loadJsPDF();
      const sourceBytes = rawPdfBytes ? rawPdfBytes.slice() : new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: sourceBytes }).promise;

      const firstPage = await pdf.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1.5 });
      const w0 = Math.round(firstViewport.width * 0.75);
      const h0 = Math.round(firstViewport.height * 0.75);
      const doc = new jsPDF({ unit: "pt", format: [w0, h0], orientation: w0 >= h0 ? "landscape" : "portrait" });

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 });
        const off = document.createElement("canvas");
        off.width = viewport.width;
        off.height = viewport.height;
        const ctx = off.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const w = Math.round(viewport.width * 0.75);
        const h = Math.round(viewport.height * 0.75);

        if (p > 1) doc.addPage([w, h], w >= h ? "landscape" : "portrait");
        doc.addImage(off.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);

        if (placed && p === placedPage) {
          const sigW = w * (sigScale / 100);
          const sigH = sigW * 0.4;
          const sigX = Math.max(0, Math.min(w - sigW, placed.x * w - sigW / 2));
          const sigY = Math.max(0, Math.min(h - sigH, placed.y * h - sigH / 2));
          doc.addImage(signatureUrl, "PNG", sigX, sigY, sigW, sigH);
        }
      }

      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFilename(`signed-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setDoneLabel(`Signature applied to page ${placedPage} of ${pdf.numPages}`);
      setState("done");
    } catch (err) {
      console.error("Sign PDF error:", err);
      setState("error");
    }
  }

  function reset() {
    stopCamera();
    setFile(null);
    setRawPdfBytes(null);
    setTyped("");
    setSignatureUrl(null);
    setRawImageCanvas(null);
    setPlaced(null);
    setPageNum(1);
    setPlacedPage(1);
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
          {/* Step 1: Create Signature */}
          <div className="sign-modes" role="tablist">
            <button
              type="button"
              className={`sign-mode-btn ${mode === "draw" ? "is-active" : ""}`}
              onClick={() => {
                stopCamera();
                setMode("draw");
                setTimeout(initDrawCanvas, 50);
              }}
            >
              ✍️ Draw
            </button>
            <button
              type="button"
              className={`sign-mode-btn ${mode === "type" ? "is-active" : ""}`}
              onClick={() => {
                stopCamera();
                setMode("type");
                if (typed) generateTypedSignature(typed, selectedFont);
              }}
            >
              ⌨️ Type
            </button>
            <button
              type="button"
              className={`sign-mode-btn ${mode === "upload" ? "is-active" : ""}`}
              onClick={() => {
                stopCamera();
                setMode("upload");
              }}
            >
              🖼️ Upload Scan
            </button>
            <button
              type="button"
              className={`sign-mode-btn ${mode === "camera" ? "is-active" : ""}`}
              onClick={() => {
                setMode("camera");
                startCamera();
              }}
            >
              📷 Camera Scan
            </button>
          </div>

          {/* Mode Panels */}
          <div className="sign-panel">
            {mode === "draw" && (
              <div className="sign-draw">
                <canvas
                  ref={drawRef}
                  className="sign-canvas"
                  width={500}
                  height={150}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    startDraw(e);
                  }}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                />
                <div className="sign-controls-row">
                  <div className="sign-color-picker">
                    <span>Ink color:</span>
                    <button
                      type="button"
                      className={`sign-color-dot ${drawColor === "#121111" ? "is-selected" : ""}`}
                      style={{ background: "#121111" }}
                      onClick={() => setDrawColor("#121111")}
                      title="Black ink"
                    />
                    <button
                      type="button"
                      className={`sign-color-dot ${drawColor === "#0f3d91" ? "is-selected" : ""}`}
                      style={{ background: "#0f3d91" }}
                      onClick={() => setDrawColor("#0f3d91")}
                      title="Blue ink"
                    />
                    <button
                      type="button"
                      className={`sign-color-dot ${drawColor === "#b30000" ? "is-selected" : ""}`}
                      style={{ background: "#b30000" }}
                      onClick={() => setDrawColor("#b30000")}
                      title="Red ink"
                    />
                  </div>
                  <button type="button" className="btn btn--secondary" onClick={initDrawCanvas}>
                    Clear Drawing
                  </button>
                </div>
              </div>
            )}

            {mode === "type" && (
              <div className="sign-type">
                <div className="sign-type-input-row">
                  <input
                    className="input"
                    type="text"
                    placeholder="Type your name..."
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      generateTypedSignature(e.target.value, selectedFont);
                    }}
                    disabled={state === "processing"}
                  />
                  <div className="sign-color-picker">
                    <button
                      type="button"
                      className={`sign-color-dot ${drawColor === "#121111" ? "is-selected" : ""}`}
                      style={{ background: "#121111" }}
                      onClick={() => {
                        setDrawColor("#121111");
                        if (typed) generateTypedSignature(typed, selectedFont);
                      }}
                      title="Black"
                    />
                    <button
                      type="button"
                      className={`sign-color-dot ${drawColor === "#0f3d91" ? "is-selected" : ""}`}
                      style={{ background: "#0f3d91" }}
                      onClick={() => {
                        setDrawColor("#0f3d91");
                        if (typed) generateTypedSignature(typed, selectedFont);
                      }}
                      title="Blue"
                    />
                  </div>
                </div>

                <div className="sign-font-choices">
                  <div
                    className={`sign-font-card ${selectedFont === "cursive" ? "is-active" : ""}`}
                    style={{ fontFamily: "'Brush Script MT', 'Dancing Script', cursive" }}
                    onClick={() => {
                      setSelectedFont("cursive");
                      generateTypedSignature(typed || "Signature", "cursive");
                    }}
                  >
                    {typed || "Signature"}
                  </div>
                  <div
                    className={`sign-font-card ${selectedFont === "brush" ? "is-active" : ""}`}
                    style={{ fontFamily: "'Segoe Script', 'Snell Roundhand', cursive" }}
                    onClick={() => {
                      setSelectedFont("brush");
                      generateTypedSignature(typed || "Signature", "brush");
                    }}
                  >
                    {typed || "Signature"}
                  </div>
                  <div
                    className={`sign-font-card ${selectedFont === "serif" ? "is-active" : ""}`}
                    style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}
                    onClick={() => {
                      setSelectedFont("serif");
                      generateTypedSignature(typed || "Signature", "serif");
                    }}
                  >
                    {typed || "Signature"}
                  </div>
                </div>
              </div>
            )}

            {mode === "upload" && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                />
                <div className="sign-upload-box" onClick={() => fileInputRef.current?.click()}>
                  <span style={{ fontSize: "2rem" }}>📄</span>
                  <strong>Choose a photo of your signature on white paper</strong>
                  <p>PNG, JPG, or WebP. The white paper background will be automatically removed.</p>
                </div>

                {rawImageCanvas && (
                  <div className="sign-threshold-control">
                    <span>Paper Background Filter:</span>
                    <input
                      type="range"
                      min="120"
                      max="245"
                      value={threshold}
                      onChange={(e) => updateThreshold(Number(e.target.value))}
                    />
                    <span>{threshold}</span>
                  </div>
                )}
              </div>
            )}

            {mode === "camera" && (
              <div>
                {cameraError ? (
                  <div style={{ textAlign: "center", color: "var(--color-error)", padding: "1rem" }}>
                    <p>{cameraError}</p>
                    <button type="button" className="btn btn--secondary" onClick={() => setMode("upload")}>
                      Use Image Upload Instead
                    </button>
                  </div>
                ) : cameraActive ? (
                  <div>
                    <div className="sign-camera-view">
                      <video ref={videoRef} autoPlay playsInline muted className="sign-camera-video" />
                      <div className="sign-camera-guide">
                        <span>Hold signature on white paper inside guide</span>
                      </div>
                    </div>
                    <div className="sign-camera-actions">
                      <button type="button" className="btn btn--primary" onClick={captureCameraSnapshot}>
                        📸 Capture Signature
                      </button>
                      <button type="button" className="btn btn--secondary" onClick={stopCamera}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ textAlign: "center", padding: "1rem" }}>
                      <p>Signature captured from camera!</p>
                      <button type="button" className="btn btn--secondary" onClick={startCamera}>
                        📷 Retake Snapshot
                      </button>
                    </div>
                    {rawImageCanvas && (
                      <div className="sign-threshold-control">
                        <span>Paper Background Filter:</span>
                        <input
                          type="range"
                          min="120"
                          max="245"
                          value={threshold}
                          onChange={(e) => updateThreshold(Number(e.target.value))}
                        />
                        <span>{threshold}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Live PDF Preview & Movable Signature on Document */}
          <div className="sign-preview-wrap">
            <div className="sign-preview-header">
              {signatureUrl ? (
                <div className="sign-extracted-card">
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                    Signature:
                  </span>
                  <img src={signatureUrl} alt="Signature" className="sign-extracted-img" />
                </div>
              ) : (
                <div style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                  ✍️ Create or upload your signature above to place it on the document.
                </div>
              )}

              <div className="sign-pages-nav">
                {signatureUrl && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginRight: "0.5rem" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Size:</span>
                    <input
                      type="range"
                      min="10"
                      max="65"
                      value={sigScale}
                      onChange={(e) => setSigScale(Number(e.target.value))}
                      style={{ width: "85px" }}
                    />
                  </label>
                )}

                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={pageNum <= 1}
                  onClick={() => setPageNum((p) => p - 1)}
                >
                  ‹ Prev
                </button>
                <span>
                  Page {pageNum} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={pageNum >= totalPages}
                  onClick={() => setPageNum((p) => p + 1)}
                >
                  Next ›
                </button>
              </div>
            </div>

            <p className="sign-hint">
              ✋ <strong>Drag & move</strong> the signature directly onto the PDF line, or click anywhere on the page to reposition.
            </p>

            <div className="sign-page-wrap" ref={pageWrapRef}>
              <div className="sign-page-container">
                <canvas
                  ref={pageCanvasRef}
                  className="sign-page"
                  onClick={handleCanvasClick}
                  style={{ cursor: signatureUrl ? "crosshair" : "default" }}
                />

                {signatureUrl && placed && placedPage === pageNum && (
                  <div
                    className={`sign-place-marker ${isDragging ? "is-dragging" : ""}`}
                    style={{
                      left: `${placed.x * 100}%`,
                      top: `${placed.y * 100}%`,
                      width: `${sigScale}%`,
                    }}
                    onPointerDown={handleMarkerPointerDown}
                  >
                    <span className="sign-marker-badge">✋ Drag to move</span>
                    <button
                      type="button"
                      className="sign-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlaced(null);
                      }}
                      title="Remove signature from page"
                    >
                      ×
                    </button>
                    <img src={signatureUrl} alt="" />
                    <div
                      className="sign-resize-handle"
                      onPointerDown={handleResizePointerDown}
                      title="Drag corner to resize"
                    />
                  </div>
                )}
              </div>
            </div>

            {signatureUrl && state !== "done" && (
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={state === "processing"}
                onClick={bake}
                style={{ padding: "0.9rem", fontSize: "1.05rem", marginTop: "0.75rem" }}
              >
                {state === "processing" ? messages.processing : `Download Signed PDF`}
              </button>
            )}
          </div>

          <p className="legal-note">{messages.legalNote}</p>
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
