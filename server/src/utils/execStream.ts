import { spawn } from "node:child_process";

/**
 * Check whether a native binary exists on PATH.
 * Tries --version first, then -v / -version: Poppler tools (pdftoppm,
 * pdftotext) reject --version and only answer to -v, so a single probe
 * would wrongly report them missing (and disable those endpoints).
 */
export async function hasBinary(bin: string): Promise<boolean> {
  for (const args of [["--version"], ["-v"], ["-version"]]) {
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(bin, args, { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
    });
    if (ok) return true;
  }
  return false;
}

export interface ExecResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

/** Run a CLI streaming input file -> output file. Rejects on non-zero exit. */
export function runBin(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer =
      opts.timeoutMs != null
        ? setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`${bin} timed out`));
          }, opts.timeoutMs)
        : null;
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf8").slice(0, 4000);
      if (code === 0) {
        resolve({ code: code ?? 0, stdout: Buffer.concat(out), stderr });
      } else {
        reject(new Error(`${bin} exited ${code}: ${stderr}`));
      }
    });
  });
}
