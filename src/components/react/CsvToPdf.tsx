import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadJsPDF, type ToolMessages } from "@/lib/pdf";

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

export default function CsvToPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
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
  }

  async function convert() {
    if (!file) return;
    setState("processing");
    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) throw new Error("empty CSV");

      const { jsPDF } = await loadJsPDF();
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const { autoTable } = await import("jspdf-autotable");

      const body = rows.map((r) => headers.map((_, i) => r[i] ?? ""));

      autoTable(doc, {
        head: [headers],
        body,
        // Let autotable paginate; add a page-number footer on each page.
        didDrawPage: () => {
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(
            `Page ${doc.getNumberOfPages()}`,
            40,
            doc.internal.pageSize.getHeight() - 16,
          );
        },
        styles: {
          fontSize: 8,
          cellPadding: 4,
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: { fillColor: [255, 46, 46], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 248, 246] },
        margin: { left: 40, right: 40, top: 40, bottom: 40 },
      });

      const blob = doc.output("blob");
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`${file.name.replace(/\.csv$/i, "")}-table.pdf`);
      setDoneLabel(`${headers.length} columns · ${rows.length} rows · ${formatBytes(blob.size)}`);
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
        hint="CSV"
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
