import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import { PDF_ENDPOINTS, isServerConfigured, tryServerApi } from "@/lib/api";

interface Props {
  messages: ToolMessages;
}

export default function LockPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("locked.pdf");

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

  async function lock() {
    if (!file || !password) return;
    // A typo here locks the user out of their own file — require confirmation.
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setState("processing");
    // Server-first: AES-256 via QPDF. Falls back to browser encryption.
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("password", password);
      fd.append("keyLength", "256");
      const blob = await tryServerApi(PDF_ENDPOINTS.lock, fd);
      if (blob && blob.size > 0) {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(URL.createObjectURL(blob));
        setFilename(`locked-${Date.now()}.pdf`);
        setDoneLabel(`Locked · ${formatBytes(blob.size)} · via secure server`);
        setState("done");
        return;
      }
    } catch (e) {
      console.warn("Server lock failed, falling back to browser processing:", e);
    }
    try {
      const { PDFDocument } = await loadPdfLib();
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      await doc.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: true,
          documentAssembly: false,
        },
      });
      const bytes = await doc.save();
      const blob = pdfBlob(bytes);
      setDownloadUrl(URL.createObjectURL(blob));
      setFilename(`locked-${Date.now()}.pdf`);
      setDoneLabel(`Locked · ${formatBytes(blob.size)}`);
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setPassword("");
    setConfirm("");
    setMismatch(false);
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
          <label htmlFor="password">{messages.passwordLabel}</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMismatch(false);
            }}
            autoComplete="new-password"
            placeholder={messages.passwordLabel}
            disabled={state === "processing"}
          />
          <label htmlFor="password-confirm">{messages.confirmPasswordLabel}</label>
          <input
            id="password-confirm"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setMismatch(false);
            }}
            autoComplete="new-password"
            placeholder={messages.confirmPasswordLabel}
            disabled={state === "processing"}
          />
          {mismatch && (
            <p className="field-error" role="alert">
              {messages.passwordMismatch}
            </p>
          )}
          <p className="password-hint">
            {isServerConfigured()
              ? "Sent over HTTPS to our secure server, encrypted there, and deleted instantly."
              : "Your file stays on your device — the password is only used in memory."}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing" || !password || !confirm}
            onClick={lock}
          >
            {messages.lockAction}
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
