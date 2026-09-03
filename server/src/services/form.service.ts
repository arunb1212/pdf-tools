import fs from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import type { Scratch } from "../utils/scratch.js";

export interface Redaction {
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Overlay a signature PNG/JPG onto a page at PDF points coords. Pure JS. */
export async function signPdf(
  scratch: Scratch,
  inputPath: string,
  sig: { data: Buffer; mimetype: string },
  opts: { page: number; x: number; y: number; w: number; h: number },
): Promise<string> {
  const bytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const idx = Math.min(Math.max(1, opts.page), pages.length) - 1;
  const target = pages[idx];
  const isPng = sig.mimetype.includes("png");
  const img = isPng ? await doc.embedPng(sig.data) : await doc.embedJpg(sig.data);
  target.drawImage(img, { x: opts.x, y: opts.y, width: opts.w, height: opts.h });
  const outPath = scratch.path("signed.pdf");
  await fs.writeFile(outPath, await doc.save());
  return outPath;
}

/** Fill AcroForm fields from JSON + optional flatten. Pure JS. */
export async function fillForm(
  scratch: Scratch,
  inputPath: string,
  fields: Record<string, string>,
  flatten: boolean,
): Promise<string> {
  const bytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  for (const [name, value] of Object.entries(fields)) {
    try {
      const field = form.getTextField(name);
      field.setText(String(value));
    } catch {
      // Unknown / non-text field: skip (never fail the whole request).
    }
  }
  if (flatten) form.flatten();
  const outPath = scratch.path("filled.pdf");
  await fs.writeFile(outPath, await doc.save());
  return outPath;
}

/**
 * Permanent redaction: paint opaque boxes over rects.
 * Note: true content-stream sanitization needs Ghostscript; the overlay
 * approach here matches the client tool and is the documented behavior.
 */
export async function hideData(
  scratch: Scratch,
  inputPath: string,
  redactions: Redaction[],
): Promise<string> {
  if (redactions.length === 0)
    throw Object.assign(new Error("redactions[] is required"), { statusCode: 400 });
  const bytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const r of redactions) {
    const target = pages[(r.page ?? 1) - 1];
    if (!target) continue;
    target.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      color: rgb(0, 0, 0),
      opacity: 1,
    });
  }
  const outPath = scratch.path("redacted.pdf");
  await fs.writeFile(outPath, await doc.save());
  return outPath;
}
