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
 * Quality ladder for target-size mode, best quality first.
 * DPI is the coarse knob; below it, QFactor (lower = bigger output —
 * verified empirically against Ghostscript 10.x) extends the ceiling
 * for targets near the original size.
 */
const LADDER: Array<{ dpi: number; q: number | null }> = [
  { dpi: 300, q: 0.02 },
  { dpi: 300, q: 0.1 },
  { dpi: 300, q: null },
  { dpi: 250, q: null },
  { dpi: 200, q: null },
  { dpi: 150, q: null },
  { dpi: 120, q: null },
  { dpi: 100, q: null },
  { dpi: 80, q: null },
  { dpi: 72, q: null },
];

function startRung(quality: number): number {
  if (quality >= 75) return 2;
  if (quality >= 60) return 4;
  if (quality >= 40) return 5;
  if (quality >= 25) return 7;
  return 9;
}

function rungLabel(r: { dpi: number; q: number | null }): string {
  return r.q == null ? `dpi${r.dpi}` : `dpi${r.dpi}-q${r.q}`;
}

async function gsQualityPass(
  inPath: string,
  outPath: string,
  rung: { dpi: number; q: number | null },
): Promise<number> {
  const dpi = rung.dpi;
  const base = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.5",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dDetectDuplicateImages=true",
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    "-dDownsampleMonoImages=true",
    `-dColorImageResolution=${dpi}`,
    `-dGrayImageResolution=${dpi}`,
    `-dMonoImageResolution=${Math.min(300, dpi * 2)}`,
  ];
  // NOTE: with -c/-f form, -sOutputFile must precede -c and input goes via -f.
  const args =
    rung.q == null
      ? [...base, `-sOutputFile=${outPath}`, inPath]
      : [
          ...base,
          `-sOutputFile=${outPath}`,
          "-c",
          `<< /ColorACSImageDict << /QFactor ${rung.q} /Blend 1 >> >> setdistillerparams`,
          "-f",
          inPath,
        ];
  await runBin("gs", args, { timeoutMs: 90_000 });
  return (await fs.stat(outPath)).size;
}

/**
 * Ghostscript vector-preserving compression.
 * - Without a target: single PDFSETTINGS pass (fast).
 * - With targetKB: walks the DPI ladder (≤4 gs runs) to land inside
 *   [70% of target, target + 3%]. Vector-only PDFs don't respond to DPI —
 *   the loop detects no-progress and returns the best effort.
 * Falls back to pdf-lib object-stream recompress when `gs` is missing
 * (e.g. local macOS dev without Docker).
 */
export async function compressPdf(
  scratch: Scratch,
  inputPath: string,
  quality: number,
  targetKB?: number,
): Promise<string> {
  const q = Math.min(100, Math.max(10, Math.round(quality)));
  const outPath = scratch.path("compressed.pdf");

  if (!(await hasBinary("gs"))) {
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

  const targetBytes =
    targetKB != null && Number.isFinite(targetKB) && targetKB > 0
      ? Math.round(targetKB * 1024)
      : null;

  if (targetBytes == null) {
    await runBin(
      "gs",
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.5",
        `-dPDFSETTINGS=${pdfSettingsForQuality(q)}`,
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

  let rung = startRung(q);
  let bestUnder: { path: string; size: number } | null = null;
  let bestOver: { path: string; size: number } | null = null;
  let lastSize = -1;

  // ≤6 gs runs (~2-4s each): typically lands in 1-3, worst case ~20s.
  for (let attempt = 0; attempt < 6; attempt++) {
    const rungSpec = LADDER[rung];
    const candidate = scratch.path(`compressed-${rungLabel(rungSpec)}-try${attempt}.pdf`);
    let size: number;
    try {
      size = await gsQualityPass(inputPath, candidate, rungSpec);
    } catch {
      break; // gs failed: fall through to best effort below
    }
    if (size <= 0) break;
    // Hit the band: at most 3% over, at least 70% of target.
    if (size <= targetBytes * 1.03 && size >= targetBytes * 0.7) {
      await fs.copyFile(candidate, outPath);
      return outPath;
    }
    if (size <= targetBytes * 1.03) {
      if (!bestUnder || size > bestUnder.size) bestUnder = { path: candidate, size };
    } else if (!bestOver || size < bestOver.size) {
      bestOver = { path: candidate, size };
    }
    // No response to DPI (vector-only doc): stop iterating.
    if (size === lastSize) break;
    lastSize = size;

    const ratio = targetBytes / size;
    if (size > targetBytes) {
      // Too big: step down the ladder (aggressively when far off).
      rung = Math.min(LADDER.length - 1, rung + (ratio < 0.5 ? 2 : 1));
    } else if (rung === 0) {
      break; // ceiling reached — accept the undershoot
    } else {
      // Too small: step quality back up.
      rung -= 1;
    }
  }

  const final = bestUnder ?? bestOver;
  if (final) {
    await fs.copyFile(final.path, outPath);
    return outPath;
  }

  // Every DPI run failed: single preset pass as last resort.
  await runBin(
    "gs",
    [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.5",
      `-dPDFSETTINGS=${pdfSettingsForQuality(q)}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outPath}`,
      inputPath,
    ],
    { timeoutMs: 120_000 },
  );
  return outPath;
}
