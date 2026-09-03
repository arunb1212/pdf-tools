import type { FastifyInstance, FastifyRequest } from "fastify";
import fs from "node:fs/promises";
import { config, MAX_FILE_BYTES } from "../config.js";
import { Scratch, saveUpload } from "../utils/scratch.js";
import { sendBuffer, sendFile, parsePageRanges, badRequest } from "../utils/http.js";
import { compressPdf } from "../services/compress.service.js";
import { mergePdfs } from "../services/merge.service.js";
import { splitPdf } from "../services/split.service.js";
import { lockPdf, unlockPdf } from "../services/security.service.js";
import { pdfToJpg, jpgToPdf } from "../services/image.service.js";
import { pdfToCsv, csvToPdf, jpgToCsv } from "../services/table.service.js";
import { signPdf, fillForm, hideData, type Redaction } from "../services/form.service.js";

interface UploadedFile {
  field: string;
  filename: string;
  mimetype: string;
  data: Buffer;
}

interface ParsedMultipart {
  files: UploadedFile[];
  fields: Record<string, string>;
}

/** Drain multipart stream into memory (capped). Files land in scratch. */
async function parseMultipart(req: FastifyRequest): Promise<ParsedMultipart> {
  const files: UploadedFile[] = [];
  const fields: Record<string, string> = {};
  const maxBytes = MAX_FILE_BYTES();
  for await (const part of (req as unknown as { parts: () => AsyncIterable<unknown> }).parts()) {
    const p = part as {
      type?: string;
      fieldname: string;
      filename?: string;
      mimetype?: string;
      value?: unknown;
      file?: AsyncIterable<Buffer>;
    };
    if (p.type === "field" || p.file == null) {
      fields[p.fieldname] = String(p.value ?? "");
    } else {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of p.file) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buf.length;
        if (size > maxBytes) {
          throw Object.assign(
            new Error(`File exceeds ${config.maxFileMB}MB limit`),
            { statusCode: 413 },
          );
        }
        chunks.push(buf);
      }
      files.push({
        field: p.fieldname,
        filename: p.filename ?? "upload",
        mimetype: p.mimetype ?? "application/octet-stream",
        data: Buffer.concat(chunks),
      });
    }
  }
  return { files, fields };
}

function need(files: UploadedFile[], field = "file"): UploadedFile {
  const f = files.find((x) => x.field === field) ?? files[0];
  if (!f) throw badRequest("No file uploaded (multipart field 'file')");
  return f;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function registerV1(app: FastifyInstance) {
  // 1. Compress PDF
  app.post("/api/v1/compress", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const quality = num(fields.quality, 50);
      const outPath = await compressPdf(scratch, inPath, quality);
      return sendFile(reply, outPath, { filename: "compressed.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 2. Merge PDF
  app.post("/api/v1/merge", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files } = await parseMultipart(req);
      if (files.length < 2) throw badRequest("Upload at least 2 PDFs as files[]");
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        paths.push(await saveUpload(scratch, `in-${i}.pdf`, files[i].data, MAX_FILE_BYTES()));
      }
      const outPath = await mergePdfs(scratch, paths);
      return sendFile(reply, outPath, { filename: "merged.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 3. Split PDF
  app.post("/api/v1/split", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const spec = parsePageRanges(fields.pageRanges ?? fields.pages);
      const res = await splitPdf(scratch, inPath, spec);
      if (res.kind === "zip") {
        return sendFile(reply, res.path, { filename: "pages.zip", contentType: "application/zip" });
      }
      return sendFile(reply, res.path, { filename: "split.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 4. Lock PDF
  app.post("/api/v1/lock", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      if (!fields.password) throw badRequest("password is required");
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const outPath = await lockPdf(scratch, inPath, fields.password, num(fields.keyLength, 256));
      return sendFile(reply, outPath, { filename: "locked.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 5. Unlock PDF
  app.post("/api/v1/unlock", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      if (!fields.password) throw badRequest("password is required");
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const outPath = await unlockPdf(scratch, inPath, fields.password);
      return sendFile(reply, outPath, { filename: "unlocked.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 6. PDF to JPG
  app.post("/api/v1/pdf-to-jpg", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const res = await pdfToJpg(scratch, inPath, num(fields.dpi, 200));
      if (res.kind === "zip") {
        return sendFile(reply, res.path, { filename: "pages.zip", contentType: "application/zip" });
      }
      return sendFile(reply, res.path, { filename: "page.jpg", contentType: "image/jpeg" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 7. JPG to PDF
  app.post("/api/v1/jpg-to-pdf", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      if (files.length === 0) throw badRequest("Upload at least 1 image");
      const outPath = await jpgToPdf(
        scratch,
        files.map((f) => ({ data: f.data, mimetype: f.mimetype })),
        fields.pageSize ?? "A4",
        num(fields.margin, 36),
        fields.orientation ?? "portrait",
      );
      return sendFile(reply, outPath, { filename: "images.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 8. PDF to CSV
  app.post("/api/v1/pdf-to-csv", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files } = await parseMultipart(req);
      const up = need(files);
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const outPath = await pdfToCsv(scratch, inPath);
      return sendFile(reply, outPath, { filename: "table.csv", contentType: "text/csv" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 9. CSV to PDF
  app.post("/api/v1/csv-to-pdf", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      const outPath = await csvToPdf(
        scratch,
        up.data,
        fields.orientation ?? "portrait",
        fields.style ?? "striped",
      );
      return sendFile(reply, outPath, { filename: "table.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 10. JPG to CSV (OCR)
  app.post("/api/v1/jpg-to-csv", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files } = await parseMultipart(req);
      const up = need(files);
      const inPath = await saveUpload(scratch, "in.img", up.data, MAX_FILE_BYTES());
      const outPath = await jpgToCsv(scratch, inPath);
      return sendFile(reply, outPath, { filename: "ocr.csv", contentType: "text/csv" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 11. Sign PDF
  app.post("/api/v1/sign", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const doc = need(files, "file");
      const sig = files.find((x) => x.field === "signatureImage") ?? files[1];
      if (!sig) throw badRequest("signatureImage is required");
      const inPath = await saveUpload(scratch, "in.pdf", doc.data, MAX_FILE_BYTES());
      const outPath = await signPdf(
        scratch,
        inPath,
        { data: sig.data, mimetype: sig.mimetype },
        {
          page: num(fields.page, 1),
          x: num(fields.x, 50),
          y: num(fields.y, 50),
          w: num(fields.w, 150),
          h: num(fields.h, 75),
        },
      );
      return sendFile(reply, outPath, { filename: "signed.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 12. Fill form
  app.post("/api/v1/fill-form", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      let parsed: Record<string, string> = {};
      try {
        parsed = JSON.parse(fields.fields ?? "{}") as Record<string, string>;
      } catch {
        throw badRequest("fields must be JSON key-values");
      }
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const outPath = await fillForm(scratch, inPath, parsed, fields.flatten !== "false");
      return sendFile(reply, outPath, { filename: "filled.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // 13. Hide data (redaction)
  app.post("/api/v1/hide-data", async (req, reply) => {
    const scratch = await Scratch.create();
    try {
      const { files, fields } = await parseMultipart(req);
      const up = need(files);
      let redactions: Redaction[];
      try {
        redactions = JSON.parse(fields.redactions ?? "[]") as Redaction[];
      } catch {
        throw badRequest("redactions must be JSON array");
      }
      const inPath = await saveUpload(scratch, "in.pdf", up.data, MAX_FILE_BYTES());
      const outPath = await hideData(scratch, inPath, redactions);
      return sendFile(reply, outPath, { filename: "redacted.pdf", contentType: "application/pdf" });
    } finally {
      await scratch.cleanup();
    }
  });

  // Debug helper: confirm nothing lingers (counts only our scratch dirs).
  app.get("/api/v1/_scratch", async (_req, reply) => {
    const entries = await fs.readdir(config.tmpDir).catch(() => []);
    const ours = entries.filter((e) => e.startsWith("pdf-"));
    return reply.send({ linger: ours.length });
  });

  void sendBuffer;
}
