import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import { ArrowUpIcon, ArrowDownIcon, CloseIcon } from "./Icons";

interface Props {
  messages: ToolMessages;
}

// Drag-reorder a list of file entries.
function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function MergePdf({ messages }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("merged.pdf");

  const accept = "application/pdf,.pdf";

  async function handleFiles(incoming: File[]) {
    const valid = incoming.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (valid.length === 0) {
      setState("error");
      return;
    }
    setFiles((prev) => [...prev, ...valid]);
    setState("idle");
  }

  async function merge() {
    setState("processing");
    try {
      const { PDFDocument } = await loadPdfLib();
      const merged = await PDFDocument.create();
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const out = await merged.save();
      const blob = pdfBlob(out);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFilename(`merged-${Date.now()}.pdf`);
      setDoneLabel(`${files.length} files · ${formatBytes(blob.size)}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
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
        hint="PDF"
      />

      {files.length > 0 && (
        <ul className="merge-list" aria-label="Files to merge">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="merge-list__item">
              <span className="merge-list__name">{file.name}</span>
              <span className="merge-list__meta">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="merge-list__btn"
                disabled={i === 0 || state === "processing"}
                onClick={() => setFiles((prev) => reorder(prev, i, i - 1))}
                aria-label={`Move ${file.name} up`}
              >
                <ArrowUpIcon size={14} />
              </button>
              <button
                type="button"
                className="merge-list__btn"
                disabled={i === files.length - 1 || state === "processing"}
                onClick={() => setFiles((prev) => reorder(prev, i, i + 1))}
                aria-label={`Move ${file.name} down`}
              >
                <ArrowDownIcon size={14} />
              </button>
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

      {files.length > 1 && state !== "done" && (
        <button type="button" className="btn btn--primary btn--block" disabled={state === "processing"} onClick={merge}>
          {messages.download}
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
