import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfJs, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, expandZipBlob, isZipBlob, tryServerApi } from "@/lib/api";

interface Props {
  messages: ToolMessages;
}

type Format = "jpg" | "png";

export default function PdfToJpg({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("jpg");
  const [scale, setScale] = useState<number>(2);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<{ url: string; name: string }[]>([]);

  const accept = "application/pdf,.pdf";

  const ext = format === "jpg" ? "jpg" : "png";
  const mime = format === "jpg" ? "image/jpeg" : "image/png";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setState("idle");
  }

  async function convert() {
    if (!file) return;
    setState("processing");
    // Server-first for JPG (high-DPI pdftoppm render, single JPG or ZIP).
    // PNG stays in the browser — the server renders JPEG only.
    if (format === "jpg") {
      try {
        const dpi = scale <= 1 ? 100 : scale <= 1.5 ? 150 : scale <= 2 ? 200 : 300;
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("dpi", String(dpi));
        fd.append("format", "jpeg");
        const blob = await tryServerApi(PDF_ENDPOINTS.pdfToJpg, fd);
        if (blob && blob.size > 0) {
          const base = file.name.replace(/\.pdf$/i, "");
          if (isZipBlob(blob)) {
            const outputs = await expandZipBlob(blob);
            setDownloads(outputs);
            setDoneLabel(`${outputs.length} images · ${formatBytes(blob.size)} · via secure server`);
          } else {
            const url = URL.createObjectURL(blob);
            setDownloads([{ url, name: `${base}-page-1.jpg` }]);
            setDoneLabel(`1 image · ${formatBytes(blob.size)} · via secure server`);
          }
          setState("done");
          return;
        }
      } catch (e) {
        console.warn("Server render failed, falling back to browser processing:", e);
      }
    }
    try {
      const pdfjs = await loadPdfJs();
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      const outputs: { url: string; name: string }[] = [];
      const base = file.name.replace(/\.pdf$/i, "");

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), mime, format === "jpg" ? 0.92 : undefined));
        outputs.push({
          url: URL.createObjectURL(blob),
          name: `${base}-page-${i}.${ext}`,
        });
        canvas.width = 0;
        canvas.height = 0;
      }

      setDownloads(outputs);
      const totalBytes = await Promise.all(outputs.map(async (o) => (await (await fetch(o.url)).blob()).size));
      setDoneLabel(`${outputs.length} image${outputs.length > 1 ? "s" : ""} · ${formatBytes(totalBytes.reduce((a, b) => a + b, 0))}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setState("idle");
    setDoneLabel(null);
    downloads.forEach((d) => URL.revokeObjectURL(d.url));
    setDownloads([]);
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
        <div className="options-row">
          <fieldset className="options-fieldset">
            <legend>Format</legend>
            <label className="radio">
              <input type="radio" name="format" checked={format === "jpg"} onChange={() => setFormat("jpg")} disabled={state === "processing"} />
              <span>JPG</span>
            </label>
            <label className="radio">
              <input type="radio" name="format" checked={format === "png"} onChange={() => setFormat("png")} disabled={state === "processing"} />
              <span>PNG</span>
            </label>
          </fieldset>
          <div className="options-scale">
            <label htmlFor="scale">Quality</label>
            <input
              id="scale"
              type="range"
              min="1"
              max="3"
              step="0.5"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              disabled={state === "processing"}
            />
            <span>×{scale}</span>
          </div>
          <button type="button" className="btn btn--primary" disabled={state === "processing"} onClick={convert}>
            {messages.pdfToJpgAction}
          </button>
        </div>
      )}

      <ProcessResult
        messages={messages}
        state={state}
        doneLabel={doneLabel}
        onReset={reset}
      >
        {state === "done" && (
          <span>Download your image(s):</span>
        )}
      </ProcessResult>

      {state === "done" && downloads.length > 0 && (
        <ul className="split-downloads">
          {downloads.map((d) => (
            <li key={d.name}>
              <a className="btn btn--primary" href={d.url} download={d.name}>
                {messages.download}
              </a>
              <span className="split-downloads__name">{d.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
