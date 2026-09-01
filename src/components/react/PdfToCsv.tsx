import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfJs, toCsv, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

const GAP = 2; // tolerance for grouping words into cells

// Group text items into rows by y-coordinate, then split each row into
// cells by x-coordinate so "extracted" tables come out as CSV columns.
function extractTableScatter(items: TextItem[]): { headers: string[]; rows: string[][] } {
  // Word-level: pdf.js already gives per-item text.
  // Cluster items into lines by y (top edge), allowing small variance.
  const lines: TextItem[][] = [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(item.y - last[0].y) < GAP) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }

  // Within each line, group into columns using x gaps.
  const grid: string[][] = [];
  for (const line of lines) {
    const cells: { text: string; x: number; w: number }[] = [];
    for (const item of line) {
      const last = cells[cells.length - 1];
      if (last && item.x - (last.x + item.w) < 4) {
        last.text += item.str;
        last.x = item.x;
        last.w = item.w;
      } else {
        cells.push({ text: item.str, x: item.x, w: item.w });
      }
    }
    grid.push(cells.map((c) => c.text));
  }

  const maxCols = Math.max(1, ...grid.map((r) => r.length));
  const padded = grid.map((r) => {
    const row = [...r];
    while (row.length < maxCols) row.push("");
    return row;
  });

  const headers = padded[0] ?? [];
  const rows = padded.slice(1);
  return { headers, rows };
}

export default function PdfToCsv({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("extracted.csv");

  const accept = "application/pdf,.pdf";

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
    try {
      const pdfjs = await loadPdfJs();
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;

      // Client-side text-layer extraction.
      const allRows: string[][] = [];
      let headers: string[] = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items: TextItem[] = content.items
          .filter((i) => i.str.trim() !== "")
          .map((i) => ({
            str: i.str,
            x: i.transform[4],
            y: i.transform[5],
            w: i.width ?? 0,
          }));

        if (items.length === 0) continue;
        const { headers: h, rows } = extractTableScatter(items);
        if (headers.length === 0) headers = h;
        allRows.push(...rows);
      }

      const finalHeaders = headers.length > 0 ? headers : ["text"];
      const csv = toCsv(finalHeaders, allRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`${file.name.replace(/\.pdf$/i, "")}-extracted.csv`);
      setDoneLabel(`Extracted ${allRows.length} rows · ${formatBytes(blob.size)}`);
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
        hint="PDF"
      />

      {file && (
        <div className="file-preview">
          <p className="file-preview__meta">
            {file.name} · {formatBytes(file.size)}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing"}
            onClick={convert}
          >
            {messages.download}
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
