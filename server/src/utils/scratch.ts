import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

/**
 * Ephemeral scratch space for one request.
 * Files live in /dev/shm (RAM-disk) when available and are unlinked
 * in a `finally` block before the response closes (see index.ts +
 * middleware/zeroRetention.ts). Nothing is ever written to a database
 * and filenames are random UUIDs (no user data in paths/logs).
 */
export class Scratch {
  dir: string;
  private files = new Set<string>();

  private constructor(dir: string) {
    this.dir = dir;
  }

  static async create(): Promise<Scratch> {
    const dir = path.join(config.tmpDir, `pdf-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    return new Scratch(dir);
  }

  path(name: string): string {
    const p = path.join(this.dir, name);
    this.files.add(p);
    return p;
  }

  async write(name: string, data: Buffer | Uint8Array): Promise<string> {
    const p = this.path(name);
    await fs.writeFile(p, data);
    return p;
  }

  /** Best-effort unlink of every tracked file + rmdir. Never throws. */
  async cleanup(): Promise<void> {
    await Promise.allSettled(
      [...this.files].map((f) => fs.unlink(f).catch(() => undefined)),
    );
    await fs.rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
    this.files.clear();
  }
}

/** Persist a multipart upload buffer to scratch. Enforces size caps. */
export async function saveUpload(
  scratch: Scratch,
  name: string,
  data: Buffer,
  maxBytes: number,
): Promise<string> {
  if (data.length === 0) throw Object.assign(new Error("Empty file"), { statusCode: 400 });
  if (data.length > maxBytes) {
    throw Object.assign(new Error(`File exceeds ${Math.round(maxBytes / 1048576)}MB limit`), {
      statusCode: 413,
    });
  }
  return scratch.write(name, data);
}
