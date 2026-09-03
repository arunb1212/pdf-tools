import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { registerZeroRetentionHooks } from "./middleware/zeroRetention.js";
import { registerV1 } from "./routes/v1.js";

const app = Fastify({ logger: false, bodyLimit: config.maxFileMB * 1024 * 1024 * 2 });

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl / health checks
    if (config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("CORS denied"), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
});

await app.register(multipart, {
  limits: {
    fileSize: config.maxFileMB * 1024 * 1024,
    files: 20,
    fields: 30,
  },
});

registerZeroRetentionHooks(app);

app.get("/health", async () => ({ ok: true, retention: "zero", tmp: config.tmpDir }));

registerV1(app);

app.setErrorHandler((err, _req, reply) => {
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  // Never echo filenames, passwords or stacks to the client log surface.
  const message = status >= 500 ? "Processing failed" : err.message || "Bad request";
  reply.code(status).send({ error: message });
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`pdf-tools-server listening on :${config.port}`);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
