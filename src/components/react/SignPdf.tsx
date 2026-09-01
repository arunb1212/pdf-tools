import { useEffect, useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadPdfJs, loadPdfLib, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

type Mode = "draw" | "type" | "upload" | "camera";

const DISPLAY_SCALE = 1.2;

// Utility: Process image to extract signature strokes from white paper
function extractSignatureFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  threshold: number = 200,
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
    
    // Perceived brightness (luminance)
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
        // Boost contrast on original ink color
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
      // White paper background -> 100% transparent
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Auto-crop to bounding box of the signature
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

// Convert base64 data URL to Uint8Array for pdf-lib
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
    let active = true;
    async function draw() {
      if (!pdf || !ref.current) return;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: DISPLAY_SCALE });
        const canvas = ref.current;
        if (!canvas || !active) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error("Failed to render PDF page:", err);
      }
    }
    draw();
    return () => {
      active = false;
    };
  }, [pdf, pageNum]);

  return <canvas ref={ref} className="sign-page" onClick={onPlace} style={{ cursor: "crosshair" }} />;
}

export default function SignPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
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
  const [sigScale, setSigScale] = useState<number>(30); // % of page width
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  // Tool state
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("signed.pdf");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const accept = "application/pdf,.pdf";

  // Clean up camera stream on unmount or mode switch
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
      const pdfjs = await loadPdfJs();
      const data = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      // Default place near bottom center
      setPlaced({ x: 0.5, y: 0.82 });
    } catch (err) {
      console.error("PDF load error:", err);
      setState("error");
    }
  }

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
    // Mirror the capture to match camera view
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, c.width, c.height);

    stopCamera();
    setRawImageCanvas(c);
    const extracted = extractSignatureFromCanvas(c, threshold);
    setSignatureUrl(extracted);
  }

  // Re-extract if threshold slider changes
  function updateThreshold(val: number) {
    setThreshold(val);
    if (rawImageCanvas) {
      const extracted = extractSignatureFromCanvas(rawImageCanvas, val);
      setSignatureUrl(extracted);
    }
  }

  // --- PDF Placement ---
  function placeOnPage(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPlaced({ x, y });
  }

  // --- Save / Bake with pdf-lib (Fast, reliable, zero quality loss) ---
  async function bake() {
    if (!file || !signatureUrl) return;
    setState("processing");
    try {
      const { PDFDocument } = await loadPdfLib();
      const pdfBytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      const pages = doc.getPages();
      const targetIndex = Math.max(0, Math.min(pageNum - 1, pages.length - 1));
      const targetPage = pages[targetIndex];
      const { width, height } = targetPage.getSize();

      // Convert signature PNG to bytes
      const sigPngBytes = dataUrlToBytes(signatureUrl);
      const sigImage = await doc.embedPng(sigPngBytes);

      const widthRatio = (sigScale / 100);
      const sigW = width * widthRatio;
      const sigH = sigW * (sigImage.height / sigImage.width);

      const posX = placed ? placed.x : 0.5;
      const posY = placed ? placed.y : 0.82;

      // In PDF coordinate space, (0, 0) is bottom-left
      const x = Math.max(0, Math.min(width - sigW, posX * width - sigW / 2));
      const y = Math.max(0, Math.min(height - sigH, height - posY * height - sigH / 2));

      targetPage.drawImage(sigImage, {
        x,
        y,
        width: sigW,
        height: sigH,
      });

      const savedBytes = await doc.save();
      const blob = new Blob([savedBytes as unknown as ArrayBuffer], { type: "application/pdf" });
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`signed-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setDoneLabel(`Signature successfully applied to page ${pageNum} of ${pages.length}`);
      setState("done");
    } catch (err) {
      console.error("Sign PDF error:", err);
      setState("error");
    }
  }

  function reset() {
    stopCamera();
    setFile(null);
    setTyped("");
    setSignatureUrl(null);
    setRawImageCanvas(null);
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
          {/* Mode Selector */}
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

          {/* Signature Preview & PDF Placement */}
          {signatureUrl && (
            <div className="sign-preview-wrap">
              <div className="sign-preview-header">
                <div className="sign-extracted-card">
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                    Active Signature:
                  </span>
                  <img src={signatureUrl} alt="Signature" className="sign-extracted-img" />
                </div>

                <div className="sign-pages-nav">
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginRight: "0.5rem" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Size:</span>
                    <input
                      type="range"
                      min="15"
                      max="55"
                      value={sigScale}
                      onChange={(e) => setSigScale(Number(e.target.value))}
                      style={{ width: "90px" }}
                    />
                  </label>

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
                📍 <strong>Click anywhere on the PDF page</strong> to position your signature.
              </p>

              <div className="sign-page-wrap">
                <SignPageView pdf={pdfDoc} pageNum={pageNum} onPlace={placeOnPage} />
                {placed && (
                  <div
                    className="sign-place-marker"
                    style={{
                      left: `${placed.x * 100}%`,
                      top: `${placed.y * 100}%`,
                      width: `${sigScale}%`,
                    }}
                  >
                    <img src={signatureUrl} alt="" />
                  </div>
                )}
              </div>

              {state !== "done" && (
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  disabled={state === "processing"}
                  onClick={bake}
                  style={{ padding: "0.9rem", fontSize: "1.05rem" }}
                >
                  {state === "processing" ? messages.processing : `Apply & Download Signed PDF`}
                </button>
              )}
            </div>
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
