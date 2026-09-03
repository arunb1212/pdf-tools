import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { fmt, formatBytes, loadJsPDF, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, tryServerApi } from "@/lib/api";

interface Props {
  messages: ToolMessages;
}

export interface CsvRow {
  headers: string[];
  rows: string[][];
}

// Parse CSV text (robust to quoted fields, commas, and newlines).
export function parseCsv(text: string): CsvRow {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // ignore, handled by \n
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const headers = rows[0] ?? [];
  const body = rows.slice(1);
  return { headers, rows: body };
}

function breakLongWords(val: string): string {
  if (!val || typeof val !== "string") return val ?? "";
  // Insert zero-width space after URL/path delimiters and long unbroken tokens so autoTable wraps them
  return val
    .replace(/([\/\?=&_#\.-])/g, "$1\u200B")
    .replace(/([^\s\u200B]{18})/g, "$1\u200B");
}

export default function CsvToPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ cols: number; rows: number } | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("table.pdf");

  const accept = ".csv,text/csv";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f) return;
    if (f.type !== "text/csv" && !f.name.toLowerCase().endsWith(".csv")) {
      setState("error");
      return;
    }
    setFile(f);
    setState("idle");
    // Peek at the table shape so the user sees what will be converted.
    try {
      const { headers, rows } = parseCsv(await f.text());
      setPreview(headers.length > 0 ? { cols: headers.length, rows: rows.length } : null);
    } catch {
      setPreview(null);
    }
  }

  async function convert() {
    if (!file) return;
    setState("processing");
    // Server-first: formatted PDF table (landscape for wide tables,
    // matching the browser path below).
    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      if (headers.length > 0) {
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("orientation", headers.length > 4 ? "landscape" : "portrait");
        fd.append("style", "striped");
        const blob = await tryServerApi(PDF_ENDPOINTS.csvToPdf, fd);
        if (blob && blob.size > 0) {
          if (downloadUrl) URL.revokeObjectURL(downloadUrl);
          setDownloadUrl(URL.createObjectURL(blob));
          setFilename(`${file.name.replace(/\.csv$/i, "")}-table.pdf`);
          setDoneLabel(`${fmt(messages.doneTable, { cols: headers.length, rows: rows.length, size: formatBytes(blob.size) })} ${messages.viaServer}`);
          setState("done");
          return;
        }
      }
    } catch (e) {
      console.warn("Server conversion failed, falling back to browser processing:", e);
    }
    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) throw new Error("empty CSV");

      const numCols = headers.length;
      // Use landscape orientation for tables with more than 4 columns
      const isLandscape = numCols > 4;
      const { jsPDF } = await loadJsPDF();
      const doc = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });

      const autoTableMod = await import("jspdf-autotable");
      const autoTableFn = (autoTableMod as any).default || (autoTableMod as any).autoTable;

      // Format headers and body with soft word-breaks for URLs and long identifiers
      const formattedHeaders = headers.map((h) => breakLongWords(h));
      const formattedBody = rows.map((r) =>
        headers.map((_, i) => breakLongWords(r[i] ?? ""))
      );

      const usableWidth = isLandscape ? 842 - 60 : 595 - 60;
      const minColWidth = Math.max(30, Math.floor(usableWidth / (numCols * 1.5)));

      autoTableFn(doc, {
        head: [formattedHeaders],
        body: formattedBody,
        theme: "striped",
        styles: {
          fontSize: numCols > 8 ? 6.5 : numCols > 5 ? 7.5 : 8.5,
          cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
          overflow: "linebreak",
          valign: "top",
          minCellWidth: minColWidth,
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [30, 41, 59], // Sleek slate navy header
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: numCols > 8 ? 7 : numCols > 5 ? 8 : 9,
          valign: "middle",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 30, right: 30, top: 35, bottom: 35 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            30,
            doc.internal.pageSize.getHeight() - 14,
          );
        },
      });

      const blob = doc.output("blob");
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`${file.name.replace(/\.csv$/i, "")}-table.pdf`);
      setDoneLabel(fmt(messages.doneTable, { cols: headers.length, rows: rows.length, size: formatBytes(blob.size) }));
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
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
        hint="CSV"
      />

      {file && (
        <div className="file-preview">
          <p className="file-preview__meta">
            {file.name} · {formatBytes(file.size)}
          </p>
          {preview && (
            <p className="file-summary" role="status">
              {preview.cols} {messages.columnsLabel} · {preview.rows} {messages.rowsLabel}
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing"}
            onClick={convert}
          >
            {messages.csvToPdfAction}
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
