import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { hasBinary, runBin } from "../utils/execStream.js";
import type { Scratch } from "../utils/scratch.js";

// pdf-lib-with-encrypt ships a broken ESM build (pako namespace-import
// bug, same reason the Astro frontend aliases it to CJS). Load the CJS
// build directly on the server.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PDFDocument } = require("pdf-lib-with-encrypt") as any;

/** AES-256 encrypt via QPDF; falls back to pdf-lib-with-encrypt. */
export async function lockPdf(
  scratch: Scratch,
  inputPath: string,
  password: string,
  keyLength: number,
): Promise<string> {
  if (!password) throw Object.assign(new Error("password is required"), { statusCode: 400 });
  const bits = keyLength === 128 ? 128 : 256;
  const outPath = scratch.path("locked.pdf");

  if (await hasBinary("qpdf")) {
    await runBin(
      "qpdf",
      ["--encrypt", password, password, String(bits), "--", inputPath, outPath],
      { timeoutMs: 60_000 },
    );
    return outPath;
  }

  const bytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  await doc.encrypt({ userPassword: password, ownerPassword: password });
  await fs.writeFile(outPath, await doc.save({ useObjectStreams: true }));
  return outPath;
}

/** Decrypt via QPDF; falls back to pdf-lib-with-encrypt. */
export async function unlockPdf(
  scratch: Scratch,
  inputPath: string,
  password: string,
): Promise<string> {
  if (!password) throw Object.assign(new Error("password is required"), { statusCode: 400 });
  const outPath = scratch.path("unlocked.pdf");

  if (await hasBinary("qpdf")) {
    try {
      await runBin(
        "qpdf",
        ["--decrypt", `--password=${password}`, inputPath, "--", outPath],
        { timeoutMs: 60_000 },
      );
    } catch (e) {
      // Wrong password is a client error, not a server failure: surface it
      // as 401 with a clear message so UIs don't retry/fall back blindly.
      if (/invalid password|incorrect password|wrong password/i.test((e as Error).message)) {
        throw Object.assign(new Error("Incorrect password"), { statusCode: 401 });
      }
      throw e;
    }
    return outPath;
  }

  const bytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(bytes, { password });
  await fs.writeFile(outPath, await doc.save({ useObjectStreams: true }));
  return outPath;
}
