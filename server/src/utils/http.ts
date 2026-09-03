import type { FastifyReply } from "fastify";
import fs from "node:fs/promises";

/** Stream a scratch file back and set download headers. Caller still cleans scratch in finally. */
export async function sendFile(
  reply: FastifyReply,
  filePath: string,
  opts: { filename: string; contentType: string },
) {
  const data = await fs.readFile(filePath);
  return reply
    .header("Content-Type", opts.contentType)
    .header("Content-Disposition", `attachment; filename="${opts.filename}"`)
    .header("Cache-Control", "no-store")
    .send(data);
}

export function sendBuffer(
  reply: FastifyReply,
  data: Buffer | Uint8Array,
  opts: { filename: string; contentType: string },
) {
  return reply
    .header("Content-Type", opts.contentType)
    .header("Content-Disposition", `attachment; filename="${opts.filename}"`)
    .header("Cache-Control", "no-store")
    .send(Buffer.from(data));
}

export function badRequest(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Parse "1-3,5" into QPDF-style page spec. Returns normalized string.
 * Throws 400 on invalid input.
 */
export function parsePageRanges(input: string | undefined, fallback = "all"): string {
  if (!input || input.trim() === "" || input.trim().toLowerCase() === "all") return fallback;
  const raw = input.trim();
  if (!/^[0-9,\-\s]+$/.test(raw)) throw badRequest("Invalid pageRanges (expected e.g. 1-3,5)");
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw badRequest("Invalid pageRanges");
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw badRequest(`Invalid page range segment: ${p}`);
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    if (a < 1 || b < 1 || b < a) throw badRequest(`Invalid page range segment: ${p}`);
  }
  return parts.join(",");
}

/** Expand "1-3,5" into [1,2,3,5] (1-based). Caps at maxPage when known. */
export function expandPages(spec: string, maxPage?: number): number[] {
  if (spec === "all") return [];
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    for (let p = a; p <= b; p++) {
      if (maxPage != null && p > maxPage) break;
      out.push(p);
    }
  }
  return [...new Set(out)].sort((x, y) => x - y);
}
