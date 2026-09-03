import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { hasBinary, runBin } from "../utils/execStream.js";
import type { Scratch } from "../utils/scratch.js";

export interface PdfToJpgResult {
  kind: "jpg" | "zip";
  path: string;
}

/** High-DPI vector-to-JPG via Poppler pdftoppm. Requires native binary. */
export async function pdfToJpg(
  scratch: Scratch,
  inputPath: string,
  dpi: number,
): Promise<PdfToJpgResult> {
  const r = [72, 100, 150, 200, 300].includes(dpi) ? dpi : 200;
  if (!(await hasBinary("pdftoppm"))) {
    throw Object.assign(
      new Error("PDF-to-JPG needs the native renderer (pdftoppm). Run via Docker."),
      { statusCode: 501 },
    );
  }
  const prefix = scratch.path("page");
  await runBin("pdftoppm", ["-jpeg", "-r", String(r), inputPath, prefix], {
    timeoutMs: 180_000,
  });
  const dir = path.dirname(prefix);
  const entries = (await fs.readdir(dir)).filter(
    (f) => f.startsWith("page") && f.endsWith(".jpg"),
  );
  if (entries.length === 0) throw new Error("pdftoppm produced no images");
  if (entries.length === 1) return { kind: "jpg", path: path.join(dir, entries[0]) };
  const zipPath = scratch.path("pages.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    for (const f of entries.sort()) archive.file(path.join(dir, f), { name: f });
    void archive.finalize();
  });
  return { kind: "zip", path: zipPath };
}

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  Fit: [0, 0],
};

/** Embed JPEG/PNG buffers as full PDF pages (pure JS, works anywhere). */
export async function jpgToPdf(
  scratch: Scratch,
  images: { data: Buffer; mimetype: string }[],
  pageSize: string,
  margin: number,
  orientation = "portrait",
): Promise<string> {
  if (images.length === 0) throw Object.assign(new Error("Provide at least 1 image"), { statusCode: 400 });
  let size = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4;
  if (orientation === "landscape" && size[0] !== 0) size = [size[1], size[0]];
  const doc = await PDFDocument.create();
  for (const img of images) {
    const isPng = img.mimetype.includes("png") || img.data.subarray(1, 4).toString() === "PNG";
    const embedded = isPng ? await doc.embedPng(img.data) : await doc.embedJpg(img.data);
    const dims = embedded.scale(1);
    let w = dims.width;
    let h = dims.height;
    let pageW = size[0];
    let pageH = size[1];
    if (size[0] === 0) {
      pageW = w + margin * 2;
      pageH = h + margin * 2;
    } else {
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      const scale = Math.min(availW / w, availH / h, 1);
      w *= scale;
      h *= scale;
    }
    const page = doc.addPage([pageW, pageH]);
    page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }
  const outPath = scratch.path("images.pdf");
  await fs.writeFile(outPath, await doc.save());
  return outPath;
}
