import fs from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { hasBinary, runBin } from "../utils/execStream.js";
import type { Scratch } from "../utils/scratch.js";

/** QPDF merge (lossless, preserves vectors). Falls back to pdf-lib. */
export async function mergePdfs(scratch: Scratch, inputPaths: string[]): Promise<string> {
  const outPath = scratch.path("merged.pdf");
  if (inputPaths.length < 2) throw Object.assign(new Error("Provide at least 2 PDFs"), { statusCode: 400 });

  if (await hasBinary("qpdf")) {
    const args = ["--empty", "--pages", ...inputPaths.flatMap((p) => [p, "1-z"]), "--", outPath];
    await runBin("qpdf", args, { timeoutMs: 120_000 });
    return outPath;
  }

  const merged = await PDFDocument.create();
  for (const p of inputPaths) {
    const bytes = await fs.readFile(p);
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => merged.addPage(pg));
  }
  await fs.writeFile(outPath, await merged.save());
  return outPath;
}
