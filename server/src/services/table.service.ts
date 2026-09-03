import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { hasBinary, runBin } from "../utils/execStream.js";
import type { Scratch } from "../utils/scratch.js";

/** PDF table -> CSV via pdftotext layout parsing (native) with pdf.js-free fallback. */
export async function pdfToCsv(scratch: Scratch, inputPath: string): Promise<string> {
  let text = "";
  if (await hasBinary("pdftotext")) {
    const outPath = scratch.path("extracted.txt");
    await runBin("pdftotext", ["-layout", inputPath, outPath], { timeoutMs: 60_000 });
    text = await fs.readFile(outPath, "utf8");
  } else {
    throw Object.assign(
      new Error("PDF-to-CSV needs pdftotext. Run via Docker for full quality."),
      { statusCode: 501 },
    );
  }
  const csv = textToCsv(text);
  const csvPath = scratch.path("table.csv");
  await fs.writeFile(csvPath, csv);
  return csvPath;
}

/** Split whitespace-aligned text into CSV rows (2+ spaces or tabs delimit). */
function textToCsv(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "");
  const rows = lines.map((line) => {
    const cells = line.split(/ {2,}|\t/).map((c) => c.trim());
    return cells.map(csvEscape).join(",");
  });
  return rows.join("\r\n") + "\r\n";
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV -> formatted PDF table (pure JS). */
export async function csvToPdf(
  scratch: Scratch,
  csvBuffer: Buffer,
  orientation: string,
  style: string,
): Promise<string> {
  const records = parse(csvBuffer.toString("utf8"), {
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
  if (records.length === 0) throw Object.assign(new Error("CSV is empty"), { statusCode: 400 });

  const landscape = orientation.toLowerCase() === "landscape";
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = landscape ? 841.89 : 595.28;
  const pageH = landscape ? 595.28 : 841.89;
  const margin = 40;
  const headerBg = style === "minimal" ? rgb(1, 1, 1) : rgb(0.13, 0.35, 0.67);
  const headerFg = style === "minimal" ? rgb(0, 0, 0) : rgb(1, 1, 1);

  const cols = Math.max(...records.map((r) => r.length));
  const colW = (pageW - margin * 2) / cols;
  const rowH = 22;

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  records.forEach((row, ri) => {
    if (y - rowH < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    const isHeader = ri === 0;
    if (isHeader && style !== "minimal") {
      page.drawRectangle({ x: margin, y: y - rowH, width: pageW - margin * 2, height: rowH, color: headerBg });
    }
    for (let ci = 0; ci < cols; ci++) {
      const text = (row[ci] ?? "").slice(0, 60);
      page.drawText(text, {
        x: margin + ci * colW + 6,
        y: y - 15,
        size: 9,
        font: isHeader ? bold : font,
        color: isHeader ? headerFg : rgb(0.1, 0.1, 0.1),
      });
      if (style === "grid") {
        page.drawRectangle({
          x: margin + ci * colW,
          y: y - rowH,
          width: colW,
          height: rowH,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.75,
        });
      }
    }
    if (style === "striped" && ri % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - rowH,
        width: pageW - margin * 2,
        height: rowH,
        color: rgb(0.96, 0.97, 1),
        opacity: 0.6,
      });
    }
    y -= rowH;
  });

  const outPath = scratch.path("table.pdf");
  await fs.writeFile(outPath, await doc.save());
  return outPath;
}

/** OCR image -> CSV via Tesseract TSV output. Requires native binary. */
export async function jpgToCsv(scratch: Scratch, imagePath: string): Promise<string> {
  if (!(await hasBinary("tesseract"))) {
    throw Object.assign(
      new Error("OCR needs tesseract. Run via Docker."),
      { statusCode: 501 },
    );
  }
  const base = scratch.path("ocr");
  await runBin("tesseract", [imagePath, base, "--psm", "6", "tsv"], {
    timeoutMs: 120_000,
  });
  const tsv = await fs.readFile(`${base}.tsv`, "utf8");
  const csv = tsvToCsv(tsv);
  const csvPath = scratch.path("ocr.csv");
  await fs.writeFile(csvPath, csv);
  return csvPath;
}

function tsvToCsv(tsv: string): string {
  const lines = tsv.trim().split("\n");
  if (lines.length <= 1) return "text\r\n";
  const header = lines[0].split("\t");
  const textIdx = header.indexOf("text");
  const confIdx = header.indexOf("conf");
  const rows = lines.slice(1).map((l) => l.split("\t"));
  // Group words by block/par/line into CSV rows.
  const key = (r: string[]) => `${r[2]}-${r[3]}-${r[4]}`;
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const conf = Number(r[confIdx]);
    const text = (r[textIdx] ?? "").trim();
    if (!text || conf < 0) continue;
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(text);
  }
  const out = ["text"];
  for (const words of groups.values()) out.push(csvEscape(words.join(" ")));
  return out.join("\r\n") + "\r\n";
}
