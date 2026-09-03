import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfJs, loadJsPDF, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
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

    try {
      const pdfjs = await loadPdfJs();
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
      const numPages = pdf.numPages;

      const targetBytes = getTargetBytes();
      const originalBytes = file.size;

      // Check if structural lossless compression via pdf-lib is possible
      let losslessBytes: Uint8Array | null = null;
      try {
        const { PDFDocument } = await loadPdfLib();
        const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const saved = await pdfDoc.save({ useObjectStreams: true });
        if (saved.length < originalBytes) {
          losslessBytes = saved;
        }
      } catch (e) {
        // Ignore fallback errors
      }

      // If user asks for high fidelity (>= 75% quality) and lossless saves enough:
      if (losslessBytes && losslessBytes.length <= targetBytes && settings.quality >= 75) {
        const finalBlob = pdfBlob(losslessBytes);
        const finalSize = finalBlob.size;
        setCompressedSize(finalSize);
        setProgress(100);
        const pct = Math.round((1 - finalSize / originalBytes) * 100);
        setDoneLabel(
          `Compressed losslessly from ${formatBytes(originalBytes)} to ${formatBytes(finalSize)} (${pct}% smaller)`
        );
        const url = URL.createObjectURL(finalBlob);
        setDownloadUrl(url);
        setFilename(`compressed-${file.name.replace(/\.pdf$/i, "")}.pdf`);
        setState("done");
        return;
      }

      // High-DPI Resolution to ensure text, numbers, and tables remain 100% crisp & readable
      // 144 - 170 DPI (scale 2.0 - 2.4) preserves character glyphs with 16+ vertical pixels
      let scale = 2.0;
      if (settings.quality >= 75) {
        scale = 2.3;
      } else if (settings.quality <= 30) {
        scale = 1.65;
      } else {
        scale = 1.95;
      }

      const overhead = 1500 + numPages * 400;
      const availableImageBytes = Math.max(500 * numPages, targetBytes - overhead);
      const targetPerPage = availableImageBytes / numPages;

      // Fast binary search on page 1 canvas to calibrate exact JPEG quality for the target size
      let calibratedQuality = 0.70;
      try {
        const samplePage = await pdf.getPage(1);
        const viewport = samplePage.getViewport({ scale });
        const testCanvas = document.createElement("canvas");
        testCanvas.width = Math.max(1, Math.round(viewport.width));
        testCanvas.height = Math.max(1, Math.round(viewport.height));
        const testCtx = testCanvas.getContext("2d", { alpha: false })!;
        testCtx.fillStyle = "#ffffff";
        testCtx.fillRect(0, 0, testCanvas.width, testCanvas.height);
        await samplePage.render({ canvasContext: testCtx, viewport }).promise;

        let lowQ = 0.15;
        let highQ = 0.95;
        let bestQ = 0.70;

        for (let iter = 0; iter < 8; iter++) {
          const midQ = (lowQ + highQ) / 2;
          const dataUrl = testCanvas.toDataURL("image/jpeg", midQ);
          const approxBytes = Math.round((dataUrl.length - 23) * 0.75);
          bestQ = midQ;

          if (approxBytes > targetPerPage) {
            highQ = midQ;
          } else {
            lowQ = midQ;
          }
        }
        calibratedQuality = Math.max(0.15, Math.min(0.95, bestQ));
      } catch (e) {
        calibratedQuality = Math.max(0.2, settings.quality / 100);
      }

      async function buildRasterPdf(renderScale: number, renderQuality: number): Promise<Blob> {
        const { jsPDF } = await loadJsPDF();
        const newPdf = new jsPDF({ unit: "pt", compress: true });

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const unscaledViewport = page.getViewport({ scale: 1.0 });
          const renderViewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(renderViewport.width));
          canvas.height = Math.max(1, Math.round(renderViewport.height));
          const ctx = canvas.getContext("2d", { alpha: false })!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

          if (i > 1) {
            newPdf.addPage([unscaledViewport.width, unscaledViewport.height]);
          }

          const imgData = canvas.toDataURL("image/jpeg", renderQuality);
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

          setProgress(Math.round((i / numPages) * 90));
        }

        return newPdf.output("blob");
      }

      let resultBlob = await buildRasterPdf(scale, calibratedQuality);

      // Pass 2: If the output is still significantly off-target or exceeds target budget by > 10%:
      if (resultBlob.size > targetBytes * 1.10 || resultBlob.size >= originalBytes) {
        const shrinkFactor = Math.min(0.90, targetBytes / resultBlob.size);
        const retryScale = Math.max(1.5, scale * Math.sqrt(shrinkFactor));
        const retryQuality = Math.max(0.15, calibratedQuality * shrinkFactor);

        const retryBlob = await buildRasterPdf(retryScale, retryQuality);
        if (retryBlob.size < resultBlob.size) {
          resultBlob = retryBlob;
        }
      }

      // Hard safety guard: Compressed output MUST NEVER be larger than original file
      if (resultBlob.size >= originalBytes) {
        if (losslessBytes && losslessBytes.length < originalBytes) {
          resultBlob = pdfBlob(losslessBytes);
        } else {
          resultBlob = new Blob([bytes], { type: "application/pdf" });
        }
      }

      const finalSize = resultBlob.size;
      setProgress(100);
      setCompressedSize(finalSize);

      if (finalSize < originalBytes) {
        const compressionPercent = Math.round((1 - finalSize / originalBytes) * 100);
        setDoneLabel(
          `Compressed from ${formatBytes(originalBytes)} to ${formatBytes(finalSize)} (${compressionPercent}% smaller)`
        );
      } else {
        setDoneLabel(
          `Document is already at maximum compression (${formatBytes(originalBytes)}).`
        );
      }

      const url = URL.createObjectURL(resultBlob);
      setDownloadUrl(url);
      setFilename(`compressed-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setState("done");
    } catch (err) {
      console.error("Compression error:", err);
      setState("error");
    }
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