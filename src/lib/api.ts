// Centralized frontend client for the zero-retention PDF microservice.
//
// Usage (server-first with transparent client-side fallback):
//   import { callPdfApi, isServerConfigured, ServerNotConfigured } from "@/lib/api";
//   const fd = new FormData();
//   fd.append("file", file);
//   fd.append("quality", "50");
//   try {
//     const blob = await callPdfApi("/api/v1/compress", fd, setProgress);
//     // ... download blob
//   } catch (e) {
//     if (e instanceof ServerNotConfigured) {
//       // ... run existing client-side processing instead
//     }
//     throw e;
//   }

export const PDF_ENDPOINTS = {
  compress: "/api/v1/compress",
  merge: "/api/v1/merge",
  split: "/api/v1/split",
  lock: "/api/v1/lock",
  unlock: "/api/v1/unlock",
  pdfToJpg: "/api/v1/pdf-to-jpg",
  jpgToPdf: "/api/v1/jpg-to-pdf",
  pdfToCsv: "/api/v1/pdf-to-csv",
  csvToPdf: "/api/v1/csv-to-pdf",
  jpgToCsv: "/api/v1/jpg-to-csv",
  sign: "/api/v1/sign",
  fillForm: "/api/v1/fill-form",
  hideData: "/api/v1/hide-data",
} as const;

export type PdfEndpoint = (typeof PDF_ENDPOINTS)[keyof typeof PDF_ENDPOINTS];

export class ServerNotConfigured extends Error {
  constructor() {
    super("PDF server is not configured (PUBLIC_PDF_API_URL is empty)");
    this.name = "ServerNotConfigured";
  }
}

export class PdfApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PdfApiError";
    this.status = status;
  }
}

/** Base URL of the microservice, e.g. https://pdf-api.example.com (no trailing slash). */
export function getApiBase(): string {
  const raw =
    (import.meta.env.PUBLIC_PDF_API_URL as string | undefined) ?? "";
  return raw.trim().replace(/\/+$/, "");
}

export function isServerConfigured(): boolean {
  return getApiBase().length > 0;
}

/** Lightweight reachability probe (GET /health, 5s timeout). */
export async function checkServerHealth(timeoutMs = 5000): Promise<boolean> {
  const base = getApiBase();
  if (!base) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readErrorBlob(blob: Blob): Promise<string> {
  return blob
    .text()
    .then((t) => {
      try {
        const j = JSON.parse(t) as { error?: string };
        return j.error ?? t.slice(0, 300);
      } catch {
        return t.slice(0, 300);
      }
    })
    .catch(() => "");
}

/**
 * POST multipart FormData to the microservice and resolve with the output
 * binary (PDF / JPG / ZIP / CSV) as a Blob.
 * Uses XHR so callers get real upload progress (fetch can't report it).
 */
export function callPdfApi(
  endpoint: PdfEndpoint | string,
  formData: FormData,
  onProgress?: (pct: number) => void,
  timeoutMs = 180_000,
): Promise<Blob> {
  const base = getApiBase();
  if (!base) return Promise.reject(new ServerNotConfigured());

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}${endpoint}`);
    xhr.responseType = "blob";
    xhr.timeout = timeoutMs;

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      const blob = xhr.response as Blob;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(blob);
      } else {
        readErrorBlob(blob).then((msg) => {
          reject(new PdfApiError(xhr.status, msg || `Request failed (${xhr.status})`));
        });
      }
    };
    xhr.onerror = () => reject(new PdfApiError(0, "Network error reaching PDF server"));
    xhr.ontimeout = () => reject(new PdfApiError(0, "PDF server timed out"));
    xhr.send(formData);
  });
}

/**
 * Best-effort server attempt: returns the output Blob, or null when the
 * server is unconfigured/unreachable so the caller can run its existing
 * client-side path. Real processing errors (4xx/5xx) are rethrown.
 */export async function tryServerApi(
  endpoint: PdfEndpoint | string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<Blob | null> {
  if (!isServerConfigured()) return null;
  try {
    return await callPdfApi(endpoint, formData, onProgress);
  } catch (e) {
    if (e instanceof ServerNotConfigured) return null;
    if (e instanceof PdfApiError && e.status === 0) return null; // offline -> fallback
    throw e;
  }
}

/** True for ZIP responses (split-all, multi-page render). */
export function isZipBlob(blob: Blob): boolean {
  return (
    blob.type === "application/zip" ||
    blob.type === "application/x-zip-compressed"
  );
}

/**
 * Expand a server ZIP Blob into named object-URL entries so multi-file
 * results keep the same per-file download UI as the client-side path.
 * jszip is lazy-loaded only when a ZIP actually arrives.
 */
export async function expandZipBlob(
  blob: Blob,
): Promise<{ url: string; name: string }[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(blob);
  const out: { url: string; name: string }[] = [];
  const names = Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .sort();
  for (const name of names) {
    const data = await zip.files[name].async("blob");
    out.push({ url: URL.createObjectURL(data), name: name.split("/").pop() || name });
  }
  return out;
}
