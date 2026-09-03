import type { FastifyInstance } from "fastify";

/**
 * Zero-retention audit hook.
 * Logs ONLY method, URL path (no query/body), status and duration.
 * Filename, contents, passwords, IPs and headers are never logged.
 */
export function registerZeroRetentionHooks(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    (req as unknown as { startHr?: bigint }).startHr = process.hrtime.bigint();
  });
  app.addHook("onResponse", async (req, reply) => {
    const start = (req as unknown as { startHr?: bigint }).startHr;
    const ms = start ? Number(process.hrtime.bigint() - start) / 1e6 : -1;
    // Strip query string: never log params that could contain filenames.
    const path = req.url.split("?", 1)[0];
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${path} ${reply.statusCode} ${ms < 0 ? "-" : `${Math.round(ms)}ms`}`);
  });
}
