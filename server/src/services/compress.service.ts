import fs from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { hasBinary, runBin } from "../utils/execStream.js";
import type { Scratch } from "../utils/scratch.js";

function pdfSettingsForQuality(q: number): string {
  if (q >= 75) return "/prepress";
  if (q >= 50) return "/ebook";
  return "/screen";
}

/**
 * Ghostscript vector-preserving compression.
 * Falls back to pdf-lib object-stream recompress when `gs` is missing
 * (e.g. local macOS dev without Docker).
 */
export async function compressPdf(
  scratch: Scratch,
  inputPath: string,
  quality: number,
): Promise<string> {
  const q = Math.min(100, Math.max(10, Math.round(quality)));
  const outPath = scratch.path("compressed.pdf");

  if (await hasBinary("gs")) {
    const settings = pdfSettingsForQuality(q);
    await runBin(
      "gs",
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.5",
        `-dPDFSETTINGS=${settings}`,
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        "-dDetectDuplicateImages=true",
        `-sOutputFile=${outPath}`,
        inputPath,
      ],
      { timeoutMs: 120_000 },
    );
    return outPath;
  }

  // Pure-JS fallback: lossless structural recompress (object streams,
  // metadata strip). Never enlarges: caller compares sizes.
  const bytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setProducer("");
  doc.setCreator("");
  const saved = await doc.save({ useObjectStreams: true });
  await fs.writeFile(outPath, saved);
  return outPath;
}
