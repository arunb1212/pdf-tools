import { useCallback, useMemo, useRef, useState } from "react";
import type { DragEvent, ChangeEvent, ReactNode } from "react";

export interface FileDropzoneProps {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  busy?: boolean;
  messages: {
    dragDrop: string;
    browse: string;
    chooseFiles: string;
    unsupportedFile: string;
    or: string;
  };
  /** Extra hint shown under the dropzone. */
  hint?: string;
  children?: ReactNode;
}

/**
 * Consistent drag-and-drop + click-to-browse upload control used by every tool.
 * Accessible: keyboard-navigable button wrapping a hidden input, live-region for errors.
 */
export function FileDropzone({
  accept,
  multiple = false,
  onFiles,
  busy = false,
  messages,
  hint,
  children,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      const accepted = multiple ? files : [files[0]];
      onFiles(accepted);
      setError(null);
      // Trigger success animation
      setRecentlyAdded(true);
      setTimeout(() => setRecentlyAdded(false), 600);
    },
    [onFiles, multiple],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (busy) return;
      handleFiles(e.dataTransfer.files);
    },
    [busy, handleFiles],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      e.target.value = ""; // allow re-selecting the same file
    },
    [handleFiles],
  );

  // Parse accept string into readable file type badges (deduplicated)
  const fileTypeBadges = useMemo(() => {
    const types = accept.split(",").map(t => t.trim());
    const seen = new Set<string>();
    const badges: { label: string; color: string }[] = [];
    
    for (const type of types) {
      let label: string;
      let color: string;
      
      if (type.includes("pdf")) {
        label = "PDF";
        color = "var(--color-file-pdf)";
      } else if (type.includes("jpeg") || type.includes("jpg")) {
        label = "JPG";
        color = "var(--color-file-jpg)";
      } else if (type.includes("png")) {
        label = "PNG";
        color = "var(--color-file-png)";
      } else if (type.includes("csv")) {
        label = "CSV";
        color = "var(--color-file-csv)";
      } else if (type.includes("word") || type.includes("doc")) {
        label = "DOC";
        color = "var(--color-file-doc)";
      } else {
        label = type.replace("application/", "").replace(".", "").toUpperCase();
        color = "var(--color-text-muted)";
      }
      
      // Only add if not already seen
      if (!seen.has(label)) {
        seen.add(label);
        badges.push({ label, color });
      }
    }
    
    return badges;
  }, [accept]);

  return (
    <div className="dropzone" data-testid="dropzone">
      <div
        className={`dropzone__area${dragOver ? " is-drag" : ""}${recentlyAdded ? " is-success" : ""}`}
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className="dropzone__icon" aria-hidden="true">
          {recentlyAdded ? (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="dropzone__check"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="dropzone__upload-icon"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
        </div>
        <p className="dropzone__main">
          <strong>{recentlyAdded ? "File added!" : messages.dragDrop}</strong>
        </p>
        <p className="dropzone__sub">
          {messages.or}{" "}
          <span className="dropzone__browse">{messages.browse}</span>
          {hint ? <span className="dropzone__hint"> · {hint}</span> : null}
        </p>
        <div className="dropzone__badges">
          {fileTypeBadges.map((badge, i) => (
            <span
              key={i}
              className="dropzone__badge"
              style={{ borderColor: badge.color, color: badge.color }}
            >
              {badge.label}
            </span>
          ))}
        </div>
        {error && <p className="dropzone__error" role="alert">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        className="sr-only"
        aria-label={messages.chooseFiles}
      />
      {children}
    </div>
  );
}
