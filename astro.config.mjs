import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// https://astro.build/config
export default defineConfig({
  site: "https://pdf-tools-lemon-nine.vercel.app",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de"],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en",
          de: "de",
        },
      },
    }),
  ],
  vite: {
    optimizeDeps: {
      include: ["react", "react-dom", "pdf-lib-with-encrypt"],
      exclude: ["pdf-lib", "pdfjs-dist", "jspdf", "jspdf-autotable"],
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        // pdf-lib-with-encrypt ships a broken ESM build (pako namespace-import bug).
        // Force the working CJS build (resolved via the package's "main" field).
        "pdf-lib-with-encrypt": require.resolve("pdf-lib-with-encrypt"),
      },
    },
  },
  build: {
    inlineStylesheets: "auto",
  },
});
