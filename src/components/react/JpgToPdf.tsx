import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadJsPDF, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, tryServerApi } from "@/lib/api";
import { CloseIcon } from "./Icons";

interface Props {
  messages: ToolMessages;
}

// Read an image file into an Image object.
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function isImage(file: File): boolean {
  return /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

export default function JpgToPdf({ messages }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("images.pdf");

  const accept = "image/*";

  async function handleFiles(incoming: File[]) {
    const valid = incoming.filter(isImage);
    if (valid.length === 0) {
      setState("error");
      return;
    }
    setFiles((prev) => [...prev, ...valid]);
    setState("idle");
  }

  async function convert() {
    if (files.length === 0) return;
    setState("processing");
    // Server-first: embed images into a PDF page-size document.
    // Orientation matches the browser path (from the first image).
    try {
      const first = await loadImage(files[0]);
      const fd = new FormData();
      files.forEach((f) => fd.append("files[]", f, f.name));
      fd.append("pageSize", "A4");
      fd.append("margin", "0");
      fd.append("orientation", first.width > first.height ? "landscape" : "portrait");
      const blob = await tryServerApi(PDF_ENDPOINTS.jpgToPdf, fd);
      if (blob && blob.size > 0) {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(URL.createObjectURL(blob));
        setFilename(`images-${Date.now()}.pdf`);
        setDoneLabel(`${files.length} image${files.length > 1 ? "s" : ""} · ${formatBytes(blob.size)} · via secure server`);
        setState("done");
        return;
      }
    } catch (e) {
      console.warn("Server conversion failed, falling back to browser processing:", e);
    }
    try {
      const { jsPDF } = await loadJsPDF();
      // Determine orientation from the first image (A4 proportions).
      const first = await loadImage(files[0]);
      const landscape = first.width > first.height;
      const doc = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      for (let i = 0; i < files.length; i++) {
        const img = await loadImage(files[i]);
        if (i > 0) doc.addPage();
        // Fit image into page, preserving aspect ratio.
        const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (pageWidth - w) / 2;
        const y = (pageHeight - h) / 2;
        const dataUrl = await readAsDataURL(files[i]);
        const isPng = files[i].type === "image/png" || /\.png$/i.test(files[i].name);
        doc.addImage(dataUrl, isPng ? "PNG" : "JPEG", x, y, w, h);
      }

      const blob = doc.output("blob");
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`images-${Date.now()}.pdf`);
      setDoneLabel(`${files.length} image${files.length > 1 ? "s" : ""} · ${formatBytes(blob.size)}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function reset() {
    setFiles([]);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  function remove(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="tool">
      <FileDropzone
        accept={accept}
        multiple
        onFiles={handleFiles}
        busy={state === "processing"}
        messages={messages}
        hint="JPG / PNG"
      />

      {files.length > 0 && (
        <ul className="merge-list" aria-label="Images to convert">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="merge-list__item">
              <span className="merge-list__name">{file.name}</span>
              <span className="merge-list__meta">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="merge-list__btn merge-list__btn--remove"
                disabled={state === "processing"}
                onClick={() => remove(i)}
                aria-label={`Remove ${file.name}`}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && state !== "done" && (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={state === "processing"}
          onClick={convert}
        >
          {messages.jpgToPdfAction}
        </button>
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
