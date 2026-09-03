import fs from "node:fs";
import os from "node:os";

export const config = {
  port: Number(process.env.PORT ?? 8080),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:4321")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  maxFileMB: Number(process.env.MAX_FILE_MB ?? 50),
  // RAM-disk first (Linux containers mount /dev/shm as tmpfs).
  // Falls back to os.tmpdir() on macOS / hosts without /dev/shm.
  tmpDir: process.env.TMPDIR && existsSyncSafe(process.env.TMPDIR)
    ? process.env.TMPDIR!
    : pickTmpDir(),
};

function existsSyncSafe(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function pickTmpDir(): string {
  try {
    if (fs.existsSync("/dev/shm")) return "/dev/shm";
  } catch {
    // ignore
  }
  return process.env.TMPDIR ?? os.tmpdir();
}

export const MAX_FILE_BYTES = () => config.maxFileMB * 1024 * 1024;
