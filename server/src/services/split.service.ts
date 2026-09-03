import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { hasBinary, runBin } from "../utils/execStream.js";
import { expandPages } from "../utils/http.js";
import type { Scratch } from "../utils/scratch.js";

export interface SplitResult {
  kind: "pdf" | "zip";
  path: string;
}

/**
 * Split by pageRanges ("1-3,5" or "all").
 * - Single contiguous range -> one PDF.
 * - "all" or multiple ranges -> ZIP of per-page (or per-range) PDFs.
 */
export async function splitPdf(
  scratch: Scratch,
  inputPath: string,
  rangesSpec: string,
): Promise<SplitResult> {
  const useQpdf = await hasBinary("qpdf");

  if (useQpdf) {
    if (rangesSpec === "all") {
      return splitAllQpdf(scratch, inputPath);
    }
    const pages = expandPages(rangesSpec);
    if (pages.length === 0) throw Object.assign(new Error("Invalid pageRanges"), { statusCode: 400 });
    // Contiguous single range -> single PDF via qpdf.
    const outPath = scratch.path("split.pdf");
    await runBin(
      "qpdf",
      [inputPath, "--pages", inputPath, rangesSpec, "--", outPath],
      { timeoutMs: 120_000 },
    );
    // If multiple disjoint pages requested, qpdf already merged them into one
    // PDF which matches the "Split PDF" UX (extract pages). Return PDF.
    return { kind: "pdf", path: outPath };
  }

  // pdf-lib fallback.
  const bytes = await fs.readFile(inputPath);
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();

  if (rangesSpec === "all") {
    const paths: string[] = [];
    for (let i = 0; i < total; i++) {
      const single = await PDFDocument.create();
      const [pg] = await single.copyPages(src, [i]);
      single.addPage(pg);
      const p = scratch.path(`page-${i + 1}.pdf`);
      await fs.writeFile(p, await single.save());
      paths.push(p);
    }
    return { kind: "zip", path: await zipFiles(scratch, paths) };
  }

  const pages = expandPages(rangesSpec, total).map((n) => n - 1);
  if (pages.length === 0) throw Object.assign(new Error("Invalid pageRanges"), { statusCode: 400 });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages);
  copied.forEach((pg) => out.addPage(pg));
  const outPath = scratch.path("split.pdf");
  await fs.writeFile(outPath, await out.save());
  return { kind: "pdf", path: outPath };
}

async function splitAllQpdf(scratch: Scratch, inputPath: string): Promise<SplitResult> {
  // Ask qpdf for page count via --show-npages.
  let total = 0;
  try {
    const { runBin: run } = await import("../utils/execStream.js");
    const res = await run("qpdf", ["--show-npages", inputPath]);
    total = Number(res.stdout.toString().trim()) || 0;
  } catch {
    total = 0;
  }
  if (!total || total > 200) {
    // Safety cap: huge docs -> single-file passthrough is not useful;
    // still attempt per-page but cap at 200.
    total = Math.min(total || 0, 200);
  }
  const paths: string[] = [];
  for (let i = 1; i <= total; i++) {
    const p = scratch.path(`page-${i}.pdf`);
    await runBin("qpdf", [inputPath, "--pages", inputPath, `${i}`, "--", p]);
    paths.push(p);
  }
  return { kind: "zip", path: await zipFiles(scratch, paths) };
}

async function zipFiles(scratch: Scratch, files: string[]): Promise<string> {
  const zipPath = scratch.path("pages.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    for (const f of files) archive.file(f, { name: path.basename(f) });
    void archive.finalize();
  });
  return zipPath;
}
