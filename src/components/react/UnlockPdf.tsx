import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, PdfApiError, isServerConfigured, tryServerApi } from "@/lib/api";

interface Props {
  messages: ToolMessages;
}

export default function UnlockPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    setErrorMessage(null);
    // Server-first: decrypt via QPDF. Falls back to browser decryption
    // (a wrong password fails on both paths and lands in the error state).
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("password", password);
      const blob = await tryServerApi(PDF_ENDPOINTS.unlock, fd);
      if (blob && blob.size > 0) {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(URL.createObjectURL(blob));
        setFilename(`unlocked-${Date.now()}.pdf`);
        setDoneLabel(`Unlocked · ${formatBytes(blob.size)} · via secure server`);
        setState("done");
        return;
      }
    } catch (e) {
      // 401 means the password is wrong — authoritative, no point retrying
      // the same password in the browser.
      if (e instanceof PdfApiError && e.status === 401) {
        setErrorMessage(messages.errorPassword);
        setState("error");
        return;
      }
      console.warn("Server unlock failed, falling back to browser processing:", e);
    }
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
      // pdf-lib throws "Password incorrect" for a wrong password — tell the
      // user exactly that instead of a generic failure.
      setErrorMessage(
        /password/i.test((e as Error)?.message ?? "")
          ? messages.errorPassword
          : null,
      );
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setPassword("");
    setState("idle");
    setDoneLabel(null);
    setErrorMessage(null);
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
          <label htmlFor="unlock-password">{messages.passwordLabel}</label>
          <input
            id="unlock-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder={messages.passwordLabel}
            disabled={state === "processing"}
          />
          <p className="password-hint">
            {isServerConfigured()
              ? "Sent over HTTPS to our secure server, decrypted there, and deleted instantly."
              : "Your file stays on your device — the password is only used in memory."}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing"}
            onClick={unlock}
          >
            {messages.unlockAction}
          </button>
        </div>
      )}

      <ProcessResult
        messages={messages}
        state={state}
        doneLabel={doneLabel}
        errorMessage={errorMessage}
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
