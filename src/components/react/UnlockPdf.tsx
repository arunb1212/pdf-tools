import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

export default function UnlockPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("unlocked.pdf");

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

  async function unlock() {
    if (!file) return;
    setState("processing");
    try {
      const { PDFDocument } = await loadPdfLib();
      const bytes = await file.arrayBuffer();
      // Loading with the correct password decrypts the content streams; a wrong
      // password throws "Password incorrect". Re-saving produces an unlocked PDF.
      const doc = await PDFDocument.load(bytes, {
        password,
        updateMetadata: false,
      });
      const out = await doc.save();
      const blob = pdfBlob(out);
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`unlocked-${Date.now()}.pdf`);
      setDoneLabel(`Unlocked · ${formatBytes(blob.size)}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setPassword("");
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
        <div className="password-field">
          <label htmlFor="unlock-password">Password</label>
          <input
            id="unlock-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter the PDF password"
            disabled={state === "processing"}
          />
          <p className="password-hint">
            Your file stays on your device — the password is only used in memory.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing"}
            onClick={unlock}
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
