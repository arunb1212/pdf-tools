import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfJs, loadJsPDF, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, tryServerApi } from "@/lib/api";
import { CompressionIcon, AlertTriangleIcon } from "./Icons";

interface Props {
  messages: ToolMessages;
}

type QualityPreset = "low" | "good" | "high" | "custom";

interface CompressionSettings {
  quality: number; // 10-100
  targetSize: number; // in KB or MB
  targetUnit: "KB" | "MB";
  preset: QualityPreset;
}

const PRESET_CONFIGS: Record<"low" | "good" | "high", { label: string; description: string; quality: number }> = {
  low: { label: "Low", description: "High quality (less compression)", quality: 80 },
  good: { label: "Good", description: "Balanced quality & size", quality: 50 },
  high: { label: "High", description: "Maximum compression", quality: 25 },
};

export default function CompressPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("compressed.pdf");
  const [progress, setProgress] = useState(0);
  const [settings, setSettings] = useState<CompressionSettings>({
    quality: 50,
    targetSize: 100,
    targetUnit: "KB",
    preset: "good",
  });
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [compressedSize, setCompressedSize] = useState<number>(0);

  const accept = "application/pdf,.pdf";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setOriginalSize(f.size);
    setState("idle");
    setCompressedSize(0);
    setProgress(0);

    const originalKB = f.size / 1024;
    const initialTargetKB = Math.max(5, Math.round(originalKB * 0.5));
    const isMB = originalKB > 2048;

    setSettings({
      quality: 50,
      targetSize: isMB ? Math.max(0.1, Number((initialTargetKB / 1024).toFixed(1))) : initialTargetKB,
      targetUnit: isMB ? "MB" : "KB",
      preset: "good",
    });
  }

  function getTargetBytes(): number {
    return settings.targetUnit === "MB"
      ? settings.targetSize * 1024 * 1024
      : settings.targetSize * 1024;
  }

  function selectPreset(preset: "low" | "good" | "high") {
    const quality = PRESET_CONFIGS[preset].quality;
    const originalKB = originalSize > 0 ? originalSize / 1024 : 100;
    const estimatedTargetKB = Math.max(5, Math.round((originalKB * quality) / 100));
    const isMB = settings.targetUnit === "MB";

    setSettings({
      quality,
      targetSize: isMB ? Number((estimatedTargetKB / 1024).toFixed(2)) : estimatedTargetKB,
      targetUnit: settings.targetUnit,
      preset,
    });
  }

  function handleQualityChange(quality: number) {
    let preset: QualityPreset = "custom";
    if (quality === 80) preset = "low";
    else if (quality === 50) preset = "good";
    else if (quality === 25) preset = "high";

    const originalKB = originalSize > 0 ? originalSize / 1024 : 100;
    const estimatedTargetKB = Math.max(5, Math.round((originalKB * quality) / 100));
    const isMB = settings.targetUnit === "MB";

    setSettings({
      quality,
      targetSize: isMB ? Number((estimatedTargetKB / 1024).toFixed(2)) : estimatedTargetKB,
      targetUnit: settings.targetUnit,
      preset,
    });
  }

  function handleTargetSizeChange(value: number) {
    const safeValue = Math.max(1, value);
    const originalBytes = originalSize > 0 ? originalSize : 102400;
    const targetBytes = settings.targetUnit === "MB" ? safeValue * 1024 * 1024 : safeValue * 1024;
    const computedQuality = Math.min(100, Math.max(10, Math.round((targetBytes / originalBytes) * 100)));

    let preset: QualityPreset = "custom";
    if (computedQuality === 80) preset = "low";
    else if (computedQuality === 50) preset = "good";
    else if (computedQuality === 25) preset = "high";

    setSettings({
      quality: computedQuality,
      targetSize: safeValue,
      targetUnit: settings.targetUnit,
      preset,
    });
  }

  function handleUnitChange(newUnit: "KB" | "MB") {
    let newTarget = settings.targetSize;
    if (newUnit === "MB" && settings.targetUnit === "KB") {
      newTarget = Number((settings.targetSize / 1024).toFixed(2));
    } else if (newUnit === "KB" && settings.targetUnit === "MB") {
      newTarget = Math.round(settings.targetSize * 1024);
    }

    setSettings((prev) => ({
      ...prev,
      targetSize: Math.max(0.1, newTarget),
      targetUnit: newUnit,
    }));
  }

  const isLowQuality = settings.quality <= 35;

  async function compress() {
    if (!file) return;
    setState("processing");
    setProgress(0);

    // Server-first: Ghostscript vector-preserving compression.
    // Only accepted when it actually shrinks the file; otherwise the
    // browser path below runs (it has its own already-optimal guard).
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("quality", String(settings.quality));
      fd.append("targetKB", String(Math.round(getTargetBytes() / 1024)));
      const blob = await tryServerApi(PDF_ENDPOINTS.compress, fd, setProgress);
      if (blob && blob.size > 0 && blob.size < file.size) {
        finishCompression(blob, file.size, false, true);
        return;
      }
    } catch (e) {
      console.warn("Server compression failed, falling back to browser processing:", e);
    }
    setProgress(0);

    try {
      const pdfjs = await loadPdfJs();
      const originalBytes = file.size;
      const targetBytes = getTargetBytes();
      const targetQualityPct = settings.quality; // 10-100

      // Read file buffer once and make dedicated copies for pdfjs and pdf-lib
      const fileBuffer = await file.arrayBuffer();

      // Pass 1: Lossless Structural Compression (pdf-lib)
      // Removes unused objects, flattens metadata, and compresses object streams losslessly.
      let losslessBlob: Blob | null = null;
      try {
        const { PDFDocument } = await loadPdfLib();
        const pdfDoc = await PDFDocument.load(fileBuffer.slice(0), { ignoreEncryption: true });
        pdfDoc.setTitle("");
        pdfDoc.setAuthor("");
        pdfDoc.setSubject("");
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer("");
        pdfDoc.setCreator("");
        const savedBytes = await pdfDoc.save({ useObjectStreams: true });
        if (savedBytes && savedBytes.length > 0 && savedBytes.length < originalBytes) {
          losslessBlob = pdfBlob(savedBytes);
        }
      } catch (e) {
        // ignore - proceed to raster path
      }

      // If lossless already hits target AND user picked high-quality preset, use lossless directly.
      if (
        losslessBlob &&
        losslessBlob.size <= targetBytes &&
        losslessBlob.size > 0 &&
        targetQualityPct >= 70
      ) {
        finishCompression(losslessBlob, originalBytes, true);
        return;
      }

      // Pass 2: Raster compression with adaptive convergence
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(fileBuffer.slice(0)) }).promise;
      const numPages = pdf.numPages;

      // jsPDF overhead ≈ 1.5KB + ~400B per page
      const overhead = 1500 + numPages * 400;
      // Available bytes for all embedded JPEGs combined.
      const availableImageBytes = Math.max(2000 * numPages, targetBytes - overhead);
      const targetPerPage = availableImageBytes / numPages;

      // Decide starting parameters from the user's quality slider (10-100).
      // We translate "quality" to a starting (scale, jpegQuality) pair, then let the
      // convergence loop correct based on actual measured output size.
      const q01 = Math.min(0.95, Math.max(0.12, targetQualityPct / 100));
      let currentQuality = q01;
      let currentScale: number;

      if (targetPerPage < 8 * 1024) {
        currentScale = 1.10;
      } else if (targetPerPage < 25 * 1024) {
        currentScale = 1.25;
      } else if (targetPerPage < 60 * 1024) {
        currentScale = 1.50;
      } else if (targetPerPage < 150 * 1024) {
        currentScale = 1.75;
      } else if (targetPerPage < 350 * 1024) {
        currentScale = 2.00;
      } else {
        currentScale = 2.30;
      }

      // Pre-render page 1 once at the starting scale. We will use this canvas for
      // fast quality calibration without re-rendering.
      let calibrationCanvas: HTMLCanvasElement | null = null;
      try {
        const samplePage = await pdf.getPage(1);
        const vp = samplePage.getViewport({ scale: currentScale });
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(vp.width));
        c.height = Math.max(1, Math.round(vp.height));
        const ctx = c.getContext("2d", { alpha: false })!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        await samplePage.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise;
        calibrationCanvas = c;
      } catch (e) {
        calibrationCanvas = null;
      }

      // Calibrate JPEG quality for the target by binary searching on actual JPEG bytes
      // (via toBlob), not on the approximate dataURL size like the buggy version did.
      if (calibrationCanvas && numPages > 0) {
        currentQuality = await calibrateQualityForTarget(calibrationCanvas, targetPerPage);
      }

      const build = async (renderScale: number, renderQuality: number): Promise<Blob> => {
        const { jsPDF } = await loadJsPDF();
        const newPdf = new jsPDF({ unit: "pt", compress: true });

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const unscaledViewport = page.getViewport({ scale: 1.0 });
          const renderViewport = page.getViewport({ scale: renderScale });

          let imgBlob: Blob | null = null;

          if (i === 1 && calibrationCanvas) {
            // Reuse already-rendered page 1 (re-rasterized only if scale changed).
            if (Math.abs(renderScale - currentScale) > 0.001) {
              const page1 = await pdf.getPage(1);
              const vp1 = page1.getViewport({ scale: renderScale });
              calibrationCanvas.width = Math.max(1, Math.round(vp1.width));
              calibrationCanvas.height = Math.max(1, Math.round(vp1.height));
              const ctx1 = calibrationCanvas.getContext("2d", { alpha: false })!;
              ctx1.imageSmoothingEnabled = true;
              ctx1.imageSmoothingQuality = "high";
              ctx1.fillStyle = "#ffffff";
              ctx1.fillRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);
              await page1.render({
                canvasContext: ctx1,
                viewport: vp1,
                intent: "print",
              }).promise;
            }
            imgBlob = await canvasToJpegBlob(calibrationCanvas, renderQuality);
          } else {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(renderViewport.width));
            canvas.height = Math.max(1, Math.round(renderViewport.height));
            const ctx = canvas.getContext("2d", { alpha: false })!;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({
              canvasContext: ctx,
              viewport: renderViewport,
              intent: "print",
            }).promise;
            imgBlob = await canvasToJpegBlob(canvas, renderQuality);
          }

          if (!imgBlob || imgBlob.size === 0) {
            throw new Error("Failed to encode JPEG for page " + i);
          }

          if (i > 1) {
            newPdf.addPage([unscaledViewport.width, unscaledViewport.height]);
          }

          const imgData = await blobToDataURL(imgBlob);
          newPdf.addImage(
            imgData,
            "JPEG",
            0,
            0,
            unscaledViewport.width,
            unscaledViewport.height,
            undefined,
            "FAST"
          );

          setProgress(Math.min(90, Math.round((i / numPages) * 90)));
        }

        return newPdf.output("blob");
      };

      let resultBlob = await build(currentScale, currentQuality);

      // Convergence: up to 8 passes. Each pass measures the actual output size and
      // adjusts scale + quality accordingly. This is the loop that was missing
      // sufficient iterations in the buggy version, which is why a 1MB→400KB target
      // sometimes produced a 1.5MB file (loop gave up too early).
      for (let pass = 0; pass < 8; pass++) {
        const overBudget = resultBlob.size > targetBytes * 1.02;
        const overOriginal = resultBlob.size >= originalBytes;
        const underBudget = resultBlob.size < targetBytes * 0.92;
        const wayUnderBudget = resultBlob.size < targetBytes * 0.75;

        if (!overBudget && !overOriginal && !wayUnderBudget) {
          break;
        }

        const ratio = targetBytes / Math.max(1, resultBlob.size);

        if (overBudget || overOriginal) {
          // Shrink. Use a stronger scale reduction than the buggy sqrt-only approach
          // so we can actually converge from 1.5MB → 400KB in a few iterations.
          const newScale = Math.max(0.75, currentScale * Math.pow(ratio, 0.35));
          const newQuality = Math.max(0.10, currentQuality * Math.pow(ratio, 0.55));
          currentScale = newScale;
          currentQuality = newQuality;
        } else if (underBudget || wayUnderBudget) {
          // Boost quality back up so we don't undershoot by a huge margin.
          const newQuality = Math.min(0.95, currentQuality * Math.pow(ratio, 0.35));
          const newScale = Math.min(2.40, currentScale * Math.pow(ratio, 0.15));
          currentScale = newScale;
          currentQuality = newQuality;
        }

        const nextBlob = await build(currentScale, currentQuality);
        if (nextBlob && nextBlob.size > 0) {
          resultBlob = nextBlob;
        } else {
          break;
        }
      }

      // Final safety guard: never return 0 bytes or anything larger than the original.
      if (!resultBlob || resultBlob.size === 0) {
        if (losslessBlob && losslessBlob.size > 0) {
          resultBlob = losslessBlob;
        } else {
          resultBlob = file;
        }
      } else if (resultBlob.size >= originalBytes && losslessBlob && losslessBlob.size > 0) {
        resultBlob = losslessBlob;
      } else if (resultBlob.size >= originalBytes) {
        resultBlob = file;
      }

      finishCompression(resultBlob, originalBytes, false);
    } catch (err) {
      console.error("Compression error:", err);
      setState("error");
    }
  }

  function finishCompression(resultBlob: Blob, originalBytes: number, _lossless: boolean, viaServer = false) {
    const finalSize = resultBlob.size;
    setProgress(100);
    setCompressedSize(finalSize);

    const suffix = viaServer ? " · via secure server" : "";
    if (finalSize < originalBytes) {
      const compressionPercent = Math.round((1 - finalSize / originalBytes) * 100);
      setDoneLabel(
        `Compressed from ${formatBytes(originalBytes)} to ${formatBytes(finalSize)} (${compressionPercent}% smaller)${suffix}`
      );
    } else {
      setDoneLabel(
        `Document is already at maximum compression (${formatBytes(originalBytes)}).`
      );
    }

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const url = URL.createObjectURL(resultBlob);
    setDownloadUrl(url);
    setFilename(`compressed-${file?.name.replace(/\.pdf$/i, "") ?? "document"}.pdf`);
    setState("done");
  }

  async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob returned null"));
        },
        "image/jpeg",
        quality
      );
    });
  }

  async function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }

  async function calibrateQualityForTarget(
    canvas: HTMLCanvasElement,
    targetBytesPerPage: number
  ): Promise<number> {
    let lowQ = 0.10;
    let highQ = 0.95;
    let bestQ = 0.75;
    let minDiff = Infinity;

    try {
      for (let iter = 0; iter < 8; iter++) {
        const midQ = (lowQ + highQ) / 2;
        const blob = await canvasToJpegBlob(canvas, midQ);
        const diff = Math.abs(blob.size - targetBytesPerPage);

        if (diff < minDiff) {
          minDiff = diff;
          bestQ = midQ;
        }

        if (blob.size > targetBytesPerPage) {
          highQ = midQ;
        } else {
          lowQ = midQ;
        }
      }
    } catch (e) {
      return 0.75;
    }
    return Math.max(0.12, Math.min(0.95, bestQ));
  }

  function reset() {
    setFile(null);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setOriginalSize(0);
    setCompressedSize(0);
    setProgress(0);
  }

  const sliderFillPercent = ((settings.quality - 10) / 90) * 100;

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
        <div className="compress-options">
          <div className="compress-info">
            <span className="compress-info__label">Original size:</span>
            <span className="compress-info__value">{formatBytes(originalSize)}</span>
          </div>

          {/* Presets */}
          <div className="compress-presets">
            <span className="compress-presets__label">Compression Presets:</span>
            <div className="compress-presets__buttons">
              {(["low", "good", "high"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`compress-preset-btn ${settings.preset === preset ? "is-active" : ""}`}
                  onClick={() => selectPreset(preset)}
                >
                  <span className="compress-preset-btn__label">{PRESET_CONFIGS[preset].label}</span>
                  <span className="compress-preset-btn__desc">{PRESET_CONFIGS[preset].description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Unified Fine-Tuning Controls */}
          <div className="compress-controls">
            {/* Quality Slider */}
            <div className="compress-slider">
              <div className="compress-slider__header">
                <label className="compress-slider__label">
                  Visual Quality: <strong>{settings.quality}%</strong>
                </label>
                <span className="compress-slider__estimate">
                  ~{Math.max(0, 100 - settings.quality)}% estimated reduction
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={settings.quality}
                onChange={(e) => handleQualityChange(Number(e.target.value))}
                className="compress-slider__input"
                style={{
                  background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${sliderFillPercent}%, var(--color-border, #e2e8f0) ${sliderFillPercent}%, var(--color-border, #e2e8f0) 100%)`,
                }}
                disabled={state === "processing"}
              />
              <div className="compress-slider__labels">
                <span>Maximum compression (Smaller size)</span>
                <span>Best fidelity (Crisp text)</span>
              </div>
            </div>

            <div className="compress-divider">or specify exact target size</div>

            {/* Target File Size Input */}
            <div className="compress-target">
              <label className="compress-target__label">Target file size:</label>
              <div className="compress-target__input-group">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={settings.targetUnit === "MB" ? 0.1 : 1}
                  value={settings.targetSize}
                  onChange={(e) => handleTargetSizeChange(Number(e.target.value))}
                  className="compress-target__input"
                  disabled={state === "processing"}
                />
                <select
                  value={settings.targetUnit}
                  onChange={(e) => handleUnitChange(e.target.value as "KB" | "MB")}
                  className="compress-target__unit"
                  disabled={state === "processing"}
                >
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
              <div className="compress-target__estimate">
                <span>Calibrated quality: ~{settings.quality}%</span>
                <span className="compress-target__arrow">→</span>
                <span className="compress-target__size">
                  Budget: {formatBytes(getTargetBytes())}
                </span>
              </div>
            </div>

            {/* Warning Callout for Aggressive Compression */}
            {isLowQuality && (
              <div className="compress-warning">
                <AlertTriangleIcon size={18} />
                <div>
                  <strong>High compression warning:</strong> Compressing too aggressively may noticeably reduce visual sharpness and make small text or scanned details blurry.
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {state === "processing" && (
            <div className="compress-progress">
              <div className="compress-progress__bar">
                <div
                  className="compress-progress__fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="compress-progress__text">Processing... {progress}%</span>
            </div>
          )}

          {/* Result Preview */}
          {compressedSize > 0 && state === "done" && (
            <div className="compress-preview">
              <div className="compress-preview__bar">
                <div
                  className="compress-preview__fill"
                  style={{
                    width: `${Math.min(100, Math.max(5, (compressedSize / originalSize) * 100))}%`,
                    background:
                      compressedSize <= originalSize
                        ? "linear-gradient(90deg, var(--color-accent), var(--color-success))"
                        : "var(--color-warning, #f59e0b)",
                  }}
                />
              </div>
              <div className="compress-preview__details">
                <span className="compress-preview__original">{formatBytes(originalSize)}</span>
                <span className="compress-preview__arrow">→</span>
                <span className="compress-preview__compressed">{formatBytes(compressedSize)}</span>
                <span className="compress-preview__percent">
                  {compressedSize < originalSize
                    ? `(${Math.round((1 - compressedSize / originalSize) * 100)}% smaller)`
                    : `(Already optimal)`}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing"}
            onClick={compress}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            <CompressionIcon size={16} />
            <span>{state === "processing" ? `Processing... ${progress}%` : "Compress PDF"}</span>
          </button>
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