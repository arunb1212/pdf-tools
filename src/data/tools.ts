import type { Locale } from "../i18n/ui";

export type ProcessingMode = "client" | "hybrid" | "server" | "ocr";

export interface ToolDef {
  id: string;
  /** React island component name, e.g. "MergePdf" */
  component: string;
  processing: ProcessingMode;
  /** Localized URL slug per locale */
  slug: Record<Locale, string>;
  /** Localized short label for nav / cards */
  label: Record<Locale, string>;
  /** Localized one-line description for cards / meta */
  summary: Record<Locale, string>;
  /** Related tool ids (internal linking for SEO) */
  related: string[];
}

const en = "en";
const de = "de";

export const tools: ToolDef[] = [
  {
    id: "merge-pdf",
    component: "MergePdf",
    processing: "client",
    slug: { [en]: "merge-pdf", [de]: "pdf-zusammenfuegen" },
    label: { [en]: "Merge PDF", [de]: "PDF zusammenfügen" },
    summary: {
      [en]: "Combine multiple PDFs into one file, drag to reorder.",
      [de]: "Mehrere PDFs zu einer Datei zusammenfügen, per Drag sortieren.",
    },
    related: ["split-pdf", "pdf-to-jpg", "jpg-to-pdf"],
  },
  {
    id: "split-pdf",
    component: "SplitPdf",
    processing: "client",
    slug: { [en]: "split-pdf", [de]: "pdf-teilen" },
    label: { [en]: "Split PDF", [de]: "PDF teilen" },
    summary: {
      [en]: "Extract page ranges or split into individual pages.",
      [de]: "Seitenbereiche extrahieren oder in einzelne Seiten aufteilen.",
    },
    related: ["merge-pdf", "pdf-to-jpg", "lock-pdf"],
  },
  {
    id: "lock-pdf",
    component: "LockPdf",
    processing: "client",
    slug: { [en]: "lock-pdf", [de]: "pdf-sperren" },
    label: { [en]: "Lock PDF", [de]: "PDF sperren" },
    summary: {
      [en]: "Add password protection to a PDF.",
      [de]: "Ein PDF mit einem Passwort schützen.",
    },
    related: ["unlock-pdf", "merge-pdf", "split-pdf"],
  },
  {
    id: "unlock-pdf",
    component: "UnlockPdf",
    processing: "client",
    slug: { [en]: "unlock-pdf", [de]: "pdf-entsperren" },
    label: { [en]: "Unlock PDF", [de]: "PDF entsperren" },
    summary: {
      [en]: "Remove a password from a PDF you have the key for.",
      [de]: "Passwortschutz entfernen, wenn du das Passwort hast.",
    },
    related: ["lock-pdf", "split-pdf", "pdf-to-jpg"],
  },
  {
    id: "pdf-to-jpg",
    component: "PdfToJpg",
    processing: "client",
    slug: { [en]: "pdf-to-jpg", [de]: "pdf-zu-jpg" },
    label: { [en]: "PDF to JPG", [de]: "PDF zu JPG" },
    summary: {
      [en]: "Convert each page of a PDF to a JPG/PNG image.",
      [de]: "Jede PDF-Seite in ein JPG/PNG-Bild umwandeln.",
    },
    related: ["jpg-to-pdf", "merge-pdf", "split-pdf"],
  },
  {
    id: "jpg-to-pdf",
    component: "JpgToPdf",
    processing: "client",
    slug: { [en]: "jpg-to-pdf", [de]: "jpg-zu-pdf" },
    label: { [en]: "JPG to PDF", [de]: "JPG zu PDF" },
    summary: {
      [en]: "Combine one or more images into a single PDF.",
      [de]: "Ein oder mehrere Bilder zu einem PDF zusammenfügen.",
    },
    related: ["pdf-to-jpg", "merge-pdf", "csv-to-pdf"],
  },
  // Tier-2 (phase 1 differentiators) — not wired to islands yet.
  {
    id: "csv-to-pdf",
    component: "CsvToPdf",
    processing: "client",
    slug: { [en]: "csv-to-pdf", [de]: "csv-zu-pdf" },
    label: { [en]: "CSV to PDF", [de]: "CSV zu PDF" },
    summary: {
      [en]: "Convert CSV data into a formatted PDF table.",
      [de]: "CSV-Daten in eine formatierte PDF-Tabelle umwandeln.",
    },
    related: ["pdf-to-csv", "jpg-to-pdf", "pdf-to-jpg"],
  },
  {
    id: "pdf-to-csv",
    component: "PdfToCsv",
    processing: "hybrid",
    slug: { [en]: "pdf-to-csv", [de]: "pdf-zu-csv" },
    label: { [en]: "PDF to CSV", [de]: "PDF zu CSV" },
    summary: {
      [en]: "Extract tabular data from a PDF into CSV.",
      [de]: "Tabellendaten aus einem PDF in CSV extrahieren.",
    },
    related: ["csv-to-pdf", "pdf-to-jpg", "split-pdf"],
  },
  {
    id: "jpg-to-csv",
    component: "JpgToCsv",
    processing: "ocr",
    slug: { [en]: "jpg-to-csv", [de]: "jpg-zu-csv" },
    label: { [en]: "JPG to CSV", [de]: "JPG zu CSV" },
    summary: {
      [en]: "Extract tabular data from an image with OCR.",
      [de]: "Tabellendaten aus einem Bild per OCR extrahieren.",
    },
    related: ["pdf-to-csv", "csv-to-pdf", "pdf-to-jpg"],
  },
  // Phase 2 — Redaction & Signing tools.
  {
    id: "hide-data-on-pdf",
    component: "HideDataOnPdf",
    processing: "client",
    slug: { [en]: "hide-data-on-pdf", [de]: "pdf-daten-schwaerzen" },
    label: { [en]: "Hide Data on PDF", [de]: "PDF Daten schwärzen" },
    summary: {
      [en]: "Redact and blackout sensitive text, names, or numbers from PDF files.",
      [de]: "Sensible Daten, Namen oder Zahlen in PDF-Dateien dauerhaft schwärzen.",
    },
    related: ["sign-pdf", "lock-pdf", "pdf-to-jpg"],
  },
  {
    id: "sign-pdf",
    component: "SignPdf",
    processing: "client",
    slug: { [en]: "sign-pdf", [de]: "pdf-signieren" },
    label: { [en]: "Sign PDF", [de]: "PDF signieren" },
    summary: {
      [en]: "Draw, type, or upload a signature and place it on the document.",
      [de]: "Signatur zeichnen, tippen oder scannen und im Dokument platzieren.",
    },
    related: ["hide-data-on-pdf", "merge-pdf", "lock-pdf"],
  },
  {
    id: "fill-pdf-form",
    component: "FillFormPdf",
    processing: "client",
    slug: { [en]: "fill-pdf-form", [de]: "pdf-formular-ausfuellen" },
    label: { [en]: "Fill & Sign PDF", [de]: "PDF ausfüllen & signieren" },
    summary: {
      [en]: "Fill out PDF forms, write on blank lines, stamp checkmarks, dates, and sign.",
      [de]: "PDF-Formulare ausfüllen, Leerzeilen beschriften, Häkchen setzen und signieren.",
    },
    related: ["sign-pdf", "hide-data-on-pdf", "merge-pdf"],
  },
  {
    id: "compress-pdf",
    component: "CompressPdf",
    processing: "client",
    slug: { [en]: "compress-pdf", [de]: "pdf-komprimieren" },
    label: { [en]: "Compress PDF", [de]: "PDF komprimieren" },
    summary: {
      [en]: "Reduce PDF file size with adjustable compression quality.",
      [de]: "PDF-Dateigröße mit einstellbarer Komprimierungsqualität reduzieren.",
    },
    related: ["merge-pdf", "split-pdf", "pdf-to-jpg"],
  },
];

const byId = new Map(tools.map((t) => [t.id, t]));

export function getTool(id: string): ToolDef | undefined {
  return byId.get(id);
}

export function getRelatedToolIds(tool: ToolDef): string[] {
  return tool.related.filter((id) => byId.has(id));
}

export function getToolUrl(tool: ToolDef, locale: Locale): string {
  return locale === "en" ? `/${tool.slug.en}/` : `/${locale}/${tool.slug[locale]}/`;
}

export function getToolBySlug(slug: string): { tool: ToolDef; locale: Locale } | undefined {
  for (const t of tools) {
    if (t.slug.en === slug) return { tool: t, locale: "en" };
    if (t.slug.de === slug) return { tool: t, locale: "de" };
  }
  return undefined;
}

/** Tools read for a specific locale, in display order. Tier-1 client tools first. */
export function toolsForLocale(locale: Locale): ToolDef[] {
  return tools;
}
