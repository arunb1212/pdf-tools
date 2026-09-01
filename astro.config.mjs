import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// https://astro.build/config
export default defineConfig({
  site: "https://pdf-tools.example.com",
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
      exclude: ["pdf-lib", "pdfjs-dist", "jspdf"],
    },
    resolve: {
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
