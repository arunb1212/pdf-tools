import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, expandZipBlob, isZipBlob, tryServerApi } from "@/lib/api";

type Mode = "ranges" | "pages";

interface Props {
  messages: ToolMessages;
}

// Parse "1-3,5,7-9" into a list of page number ranges (1-indexed).
function parseRanges(input: string, total: number): [number, number][] {
  const out: [number, number][] = [];
  for (const part of input.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      if (a >= 1 && b <= total) out.push([a, b]);
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (n >= 1 && n <= total) out.push([n, n]);
    }
  }
  return out;
}

export default function SplitPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("ranges");
  const [rangeInput, setRangeInput] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<{ url: string; name: string }[]>([]);

  const accept = "application/pdf,.pdf";

  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setState("idle");
    try {
      const { PDFDocument } = await loadPdfLib();
      const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      setPageCount(doc.getPageCount());
    } catch {
      setPageCount(null);
    }
  }

  async function split() {
    if (!file) return;
    setState("processing");
    // Server-first (QPDF) when the server output matches this UI:
    // - "every page" mode -> server ZIP expanded into per-page downloads.
    // - a single range -> server returns one PDF.
    // Multi-range input stays in the browser (one file per range).
    const segments = rangeInput.split(",").map((s) => s.trim()).filter(Boolean);
    const serverRanges = mode === "pages" ? "all" : segments.length === 1 ? segments[0] : null;
    if (serverRanges) {
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("pageRanges", serverRanges);
        const blob = await tryServerApi(PDF_ENDPOINTS.split, fd);
        if (blob && blob.size > 0) {
          if (isZipBlob(blob)) {
            const outputs = await expandZipBlob(blob);
            setDownloads(outputs);
            setDoneLabel(`${outputs.length} single-page PDFs created · via secure server.`);
          } else {
            const url = URL.createObjectURL(blob);
            const name = `split-${serverRanges.replace(/[^0-9a-z]+/gi, "-")}.pdf`;
            setDownloads([{ url, name }]);
            setDoneLabel(`1 PDF created · via secure server.`);
          }
          setState("done");
          return;
        }
      } catch (e) {
        console.warn("Server split failed, falling back to browser processing:", e);
      }
    }
    try {
      const { PDFDocument } = await loadPdfLib();
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const total = src.getPageCount();
      const outputs: { url: string; name: string }[] = [];

      const makeDoc = async (start: number, end: number, name: string) => {
        const doc = await PDFDocument.create();
        const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        const pages = await doc.copyPages(src, indices);
        pages.forEach((p) => doc.addPage(p));
        const bytes = await doc.save();
        const url = URL.createObjectURL(pdfBlob(bytes));
        outputs.push({ url, name });
      };

      if (mode === "ranges") {
        const ranges = parseRanges(rangeInput, total);
        if (ranges.length === 0) throw new Error("empty ranges");
        for (const [start, end] of ranges) {
          await makeDoc(start - 1, end - 1, `split-${start}-${end}.pdf`);
        }
        setDoneLabel(`${ranges.length} PDF${ranges.length > 1 ? "s" : ""} created.`);
      } else {
        for (let i = 0; i < total; i++) {
          await makeDoc(i, i, `page-${i + 1}.pdf`);
        }
        setDoneLabel(`${total} single-page PDF${total > 1 ? "s" : ""} created.`);
      }

      setDownloads(outputs);
      setState("done");
    } catch {
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setMode("ranges");
    setRangeInput("");
    setPageCount(null);
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
        <div className="split-options">
          <div className="split-mode">
            <label className="radio">
              <input
                type="radio"
                name="mode"
                checked={mode === "ranges"}
                onChange={() => setMode("ranges")}
                disabled={state === "processing"}
              />
              <span>Extract page ranges</span>
            </label>
            {mode === "ranges" && (
              <input
                type="text"
                className="input"
                placeholder="e.g. 1-3,5,7-9"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                aria-label="Page ranges"
                disabled={state === "processing"}
              />
            )}
            <label className="radio">
              <input
                type="radio"
                name="mode"
                checked={mode === "pages"}
                onChange={() => setMode("pages")}
                disabled={state === "processing"}
              />
              <span>Split into every page</span>
            </label>
          </div>
          {pageCount !== null && (
            <p className="split-count">
              This PDF has {pageCount} page{pageCount > 1 ? "s" : ""}.
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing" || (mode === "ranges" && !rangeInput.trim())}
            onClick={split}
          >
            {messages.splitAction}
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
          <span>Download your file(s):</span>
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
