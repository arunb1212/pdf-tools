import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { csvEscape, fmt, formatBytes, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, isServerConfigured, tryServerApi } from "@/lib/api";

interface Props {
  messages: ToolMessages;
}

function isImage(file: File): boolean {
  return /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

// Split OCR text into rows by line breaks.
export function summarizeOcr(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  // Use as many cells as the widest line has whitespace-separated tokens.
  const split = lines.map((l) =>
    l === "" ? [] : l.split(/\s{1,}/).filter(Boolean),
  );
  const maxCols = Math.max(1, ...split.map((r) => r.length));
  const padded = split.map((r) => {
    const row = [...r];
    while (row.length < maxCols) row.push("");
    return row;
  });
  return { headers: padded[0], rows: padded.slice(1) };
}

export default function JpgToCsv({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("ocr.csv");

  const accept = "image/*";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || !isImage(f)) {
      setState("error");
      return;
    }
    setFile(f);
    setState("idle");
  }

  async function convert() {
    if (!file) return;
    setState("processing");
    // Server-first: native Tesseract with table-structure (TSV) output.
    // Falls back to in-browser Tesseract.js below.
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const blob = await tryServerApi(PDF_ENDPOINTS.jpgToCsv, fd);
      if (blob && blob.size > 0) {
        const text = await blob.text();
        const rowCount = Math.max(0, text.trim().split(/\r?\n/).length - 1);
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(URL.createObjectURL(blob));
        setFilename(`${file.name.replace(/\.[^.]+$/, "")}-ocr.csv`);
        setDoneLabel(`${fmt(messages.doneOcr, { n: rowCount, size: formatBytes(blob.size) })} ${messages.viaServer}`);
        setState("done");
        return;
      }
    } catch (e) {
      console.warn("Server OCR failed, falling back to browser processing:", e);
    }
    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("eng");
      const url = URL.createObjectURL(file);
      const { data } = await worker.recognize(url);
      await worker.terminate();
      URL.revokeObjectURL(url);

      const { headers, rows } = summarizeOcr(data.text ?? "");
      const lines = [headers.map(csvEscape).join(",")];
      for (const row of rows) lines.push(row.map(csvEscape).join(","));
      const csv = lines.join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`${file.name.replace(/\.[^.]+$/, "")}-ocr.csv`);
      setDoneLabel(fmt(messages.doneOcr, { n: rows.length, size: formatBytes(blob.size) }));
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
        hint="JPG / PNG"
      />

      {file && (
        <div className="file-preview">
          <p className="file-preview__meta">
            {file.name} · {formatBytes(file.size)}
          </p>
          <p className="ocr-note">{isServerConfigured() ? messages.ocrNoteServer : messages.ocrNote}</p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing"}
            onClick={convert}
          >
            {messages.pdfToCsvAction}
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
