// Helper for downloading a Blob as a file in the browser.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Build a Blob from PDF bytes, tolerating TS 5.7's Uint8Array<ArrayBufferLike>.
export function pdfBlob(bytes: Uint8Array, type = "application/pdf"): Blob {
  return new Blob([new Uint8Array(bytes as unknown as ArrayBuffer)], { type });
}

// Shared message strings passed to every client-side tool island.
export interface ToolMessages {
  dragDrop: string;
  browse: string;
  chooseFiles: string;
  unsupportedFile: string;
  or: string;
  processing: string;
  download: string;
  processAnother: string;
  errorGeneric: string;
  /** Legal disclaimer shown on the Sign PDF tool. */
  legalNote: string;
  /** OCR location note (browser vs server). */
  ocrNote: string;
  ocrNoteServer: string;
  /** Per-tool primary action verbs (clearer than a generic "Download"). */
  mergeAction: string;
  splitAction: string;
  lockAction: string;
  unlockAction: string;
  pdfToJpgAction: string;
  jpgToPdfAction: string;
  pdfToCsvAction: string;
  csvToPdfAction: string;
  /** Guidance + specific error copy. */
  needTwoFiles: string;
  errorPassword: string;
  errorNoText: string;
  passwordMismatch: string;
  passwordLabel: string;
  confirmPasswordLabel: string;
  columnsLabel: string;
  rowsLabel: string;
  reorderHint: string;
  /** "· via secure server" suffix appended to server-processed results. */
  viaServer: string;
  doneSplitOne: string;
  doneSplitMany: string;
  doneSplitPages: string;
  doneLocked: string;
  doneUnlocked: string;
  doneImages: string;
  imageUnit: string;
  doneRows: string;
  doneOcr: string;
  doneTable: string;
  doneCompressed: string;
  doneOptimal: string;
  doneSigned: string;
  doneRedacted: string;
  doneFormFilled: string;
  trustLineServer: string;
  badgeServer: string;
  doneSignedMany: string;
  jumpLabel: string;
  jumpGo: string;
  rotationLabel: string;
  signHintMulti: string;
}

// Fill a "{placeholder}" template, e.g. fmt(t.doneRows, { n: 5, size: "12 KB" }).
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

// Format a byte count into a human-readable size.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lazy-load the heavy PDF library only when the user first needs it.
 * Uses pdf-lib-with-encrypt (a drop-in pdf-lib fork that also supports
 * encrypt()/decrypt() for Lock/Unlock). The CJS build is aliased in Astro
 * config because the published ESM build has a pako import bug.
 */
export async function loadPdfLib() {
  const mod = await import("pdf-lib-with-encrypt");
  return mod;
}

export async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod;
}

export async function loadPdfJs() {
  const mod = await import("pdfjs-dist/build/pdf.mjs");
  // Set up a global worker URL so pdf.js can render off-main-thread.
  const workerUrl = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  mod.GlobalWorkerOptions.workerSrc = workerUrl.default;
  return mod;
}

// Escape a value for CSV output.
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Join 2-D cell data into CSV text.
export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

