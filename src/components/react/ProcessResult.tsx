import type { ReactNode } from "react";

export interface ProcessResultProps {
  messages: {
    processing: string;
    download: string;
    processAnother: string;
    errorGeneric: string;
  };
  state: "idle" | "processing" | "done" | "error";
  /** UI copy shown while state === "done" (e.g. page count / byte size) */
  doneLabel?: ReactNode;
  /** Specific error copy; falls back to messages.errorGeneric when omitted. */
  errorMessage?: ReactNode;
  onReset: () => void;
  /** Children are used as the download control when state === "done". */
  children?: ReactNode;
}

/**
 * Shared state/feedback shell: shows a privacy progress line while working,
 * then a download control + "process another" reset once done.
 */
export function ProcessResult({
  messages,
  state,
  doneLabel,
  errorMessage,
  onReset,
  children,
}: ProcessResultProps) {
  if (state === "processing") {
    return (
      <div className="result result--processing" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>{messages.processing}</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="result result--error" role="alert">
        <p>{errorMessage ?? messages.errorGeneric}</p>
        <button type="button" className="btn btn--secondary" onClick={onReset}>
          {messages.processAnother}
        </button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="result result--done" aria-live="polite">
        {doneLabel && <p className="result__done">{doneLabel}</p>}
        <div className="result__actions">
          {children}
          <button type="button" className="btn btn--secondary" onClick={onReset}>
            {messages.processAnother}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
