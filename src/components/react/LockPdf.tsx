import { useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { formatBytes, loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";

interface Props {
  messages: ToolMessages;
}

export default function LockPdf({ messages }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
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
    setState("processing");
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Enter a password"
            disabled={state === "processing"}
          />
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={state === "processing" || !password}
            onClick={lock}
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
