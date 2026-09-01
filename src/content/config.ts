import { defineCollection, z } from "astro:content";

const tools = defineCollection({
  type: "content",
  schema: z.object({
    // Stable tool id used for cross-linking, e.g. "merge-pdf"
    tool: z.string(),
    locale: z.enum(["en", "de"]),
    // React island component name, resolved via the tool registry
    component: z.string(),
    // Where processing happens: "client" (fully in-browser) or "hybrid"/"server"/"ocr"
    processing: z.enum(["client", "hybrid", "server", "ocr"]),
    title: z.string(),
    shortTitle: z.string(),
    description: z.string(),
    /** Numbered how-to steps for the "How to use" section. */
    steps: z.array(z.string()).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

export const collections = { tools };
