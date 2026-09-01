# Product Requirements Document

## Multi-Tool PDF Website (Global, Multi-Language)

**Version:** 1.0
**Status:** Draft for build
**Owner:** [Your name]
**Last updated:** [Date]

---

## 1. Vision & Positioning

A fast, clean, privacy-first PDF toolkit that lets anyone edit, convert, and manage PDF files directly in the browser — no uploads to a server, no sign-up required, no watermarks on free tools.

**Core differentiators vs. iLovePDF / SmallPDF / Wondershare:**

- **Privacy-first processing.** Files are processed client-side (in the browser) wherever technically possible. This is the primary trust and marketing angle.
- **CSV ↔ PDF / table extraction.** A genuinely underserved niche compared to the big document-conversion suites, which are built for documents, not structured data.
- **Clean, minimal UI.** No clutter, no aggressive upsells, no dark patterns — one clear action per page.
- **SEO-native architecture.** Every tool and every language is a real, indexable, fast-loading page — not a JS-gated app shell.

**Target audience:** Individuals and small businesses worldwide who need quick, free, no-install PDF tasks done — students, freelancers, HR/admin staff, small business owners. Multi-language from the roadmap's second phase (German, Portuguese, Italian prioritized based on prior keyword research).

---

## 2. Goals & Success Metrics

| Goal                    | Metric                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Organic discoverability | Indexed pages in Google Search Console; keyword rankings for target long-tail terms  |
| Site performance        | Core Web Vitals "Good" rating (LCP < 2.5s, INP < 200ms, CLS < 0.1) on all tool pages |
| User trust/conversion   | Tool completion rate (file processed → downloaded) per session                       |
| Differentiator traction | Traffic share and rankings specifically on CSV↔PDF / table-extraction pages          |
| Retention/growth        | Returning visitor rate; pages-per-session across tool suite                          |

---

## 3. Feature Set

### 3.1 Launch (v1) — Tier 1: Easy, ship first

| Tool           | Description                                                      | Processing                              |
| -------------- | ---------------------------------------------------------------- | --------------------------------------- |
| **Merge PDF**  | Combine multiple PDFs into one file, drag-to-reorder pages/files | Client-side (`pdf-lib`)                 |
| **Split PDF**  | Extract page ranges or split into individual pages               | Client-side (`pdf-lib`)                 |
| **Lock PDF**   | Add password protection to a PDF                                 | Client-side (`pdf-lib`)                 |
| **Unlock PDF** | Remove password from a PDF (user-supplied password)              | Client-side (`pdf-lib`)                 |
| **PDF to JPG** | Convert each page to a JPG/PNG image                             | Client-side (`pdf.js` render to canvas) |
| **JPG to PDF** | Combine one or more images into a PDF                            | Client-side (`jsPDF`)                   |

### 3.2 Launch (v1) — Tier 2: Differentiator, ship at launch

| Tool           | Description                                             | Processing                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV to PDF** | Convert CSV/spreadsheet data into a formatted PDF table | Client-side (`jsPDF` + table layout)                                                                                                                                                          |
| **PDF to CSV** | Extract tabular data from a PDF into CSV                | Hybrid: client-side text-layer extraction (`pdf.js`) for simple tables; server fallback (Python `pdfplumber`/`camelot`) for complex or scanned tables — UI clearly labels which mode was used |
| **JPG to CSV** | Extract tabular data from an image (OCR-based)          | Server-side OCR fallback (or `Tesseract.js` client-side for light use) — flagged as slower/experimental at launch                                                                             |

### 3.3 Phase 2 — Ship after initial traffic/validation

| Tool             | Description                                                  | Notes                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Write on PDF** | Add text boxes at any position on a page                     | Same canvas-overlay infra as Draw                                                                                                                                                                                 |
| **Create PDF**   | Build a blank/templated PDF from scratch (basic text/layout) | `jsPDF`-based                                                                                                                                                                                                     |
| **Sign PDF**     | Draw or type a signature, place it on the document           | Client-side; **explicitly positioned as a simple e-signature (draw/type/place), not a legally certified digital signature** — call this out in the UI/FAQ to avoid implying eIDAS/ESIGN-level legal certification |

### 3.4 Phase 3 — Deferred, needs deliberate infrastructure/legal decisions

| Tool             | Description                                          | Why deferred                                                                            |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Edit PDF**     | True text editing/reflow within existing PDF content | Requires deep PDF content-stream parsing; high engineering cost, not v1-feasible solo   |
| **Fill out PDF** | Auto-detect and fill form fields                     | Form-field auto-detection is technically finicky; ship only once core suite has traffic |

### 3.5 Explicitly out of scope for v1

- User accounts / login
- Payment / premium tiers
- Cloud storage integrations (Drive, Dropbox)
- Mobile apps

---

## 4. UI/UX Requirements

- **One primary action per page.** Each tool page has a single, obvious upload/action area above the fold — no competing CTAs.
- **Minimal visual style.** Generous white space, restrained color palette (1 accent color + neutrals), clear typography hierarchy. No pop-up ads, no auto-playing content, no aggressive upsell modals.
- **Drag-and-drop + click-to-browse** for all file inputs, consistent across every tool.
- **Progress and state clarity.** Visible processing state (e.g., "Processing in your browser…") since there's no server round-trip to imply — reinforce the privacy positioning visually, not just in copy.
- **Trust messaging placed contextually.** A short, consistent line near the upload area (e.g., "Your file never leaves your device") on every client-side tool page — this is a core conversion lever, not just a footer disclaimer.
- **Mobile-first responsive design.** A meaningful share of PDF-tool traffic is mobile; layouts must work at narrow viewports without horizontal scroll.
- **Accessibility baseline.** Proper contrast ratios, keyboard-navigable upload controls, alt text on icons, semantic HTML landmarks.
- **Consistent post-action state.** After processing, show a clear download button, a "process another file" reset, and a short related-tools suggestion (internal linking for SEO + discovery).

---

## 5. Technical Architecture

| Layer                                         | Choice                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**                                 | Astro (static-first, islands architecture)                                                                                                                    |
| **Interactive components**                    | React (or Svelte) islands, loaded via `client:visible`/`client:idle` — only the active tool widget ships JS                                                   |
| **PDF processing (client-side)**              | `pdf-lib` (merge, split, lock/unlock, create), `pdf.js` (render, PDF→JPG), `jsPDF` (JPG→PDF, CSV→PDF)                                                         |
| **Table extraction (server fallback)**        | Small Python microservice (`pdfplumber`/`camelot`), hosted separately (Fly.io/Railway) — used only when client-side extraction can't parse the table reliably |
| **OCR (JPG→CSV, future scanned-PDF support)** | `Tesseract.js` for light client-side use; queued server job for heavier documents                                                                             |
| **i18n routing**                              | Astro's built-in i18n config, subpath-based (`/de/`, `/pt/`, `/it/`), each with its own Content Collection for localized copy — not query-param based         |
| **Hosting**                                   | Vercel, Netlify, or Cloudflare Pages (edge-cached static output)                                                                                              |
| **Analytics**                                 | Plausible (privacy-respecting, reinforces product positioning) or GA4                                                                                         |

---

## 6. SEO Requirements

### 6.1 Page & metadata structure

- **One unique, indexable URL per tool per language** (e.g., `/merge-pdf`, `/de/pdf-zusammenfuegen`) — no query-param-based tool switching or language switching.
- **Unique `<title>` and `<meta description>` per page**, written natively per language (not machine-translated), including the primary keyword and a clear value prop.
- **Canonical tags** on every page pointing to itself; avoid duplicate-content traps between similar tool pages.
- **`hreflang` tags** linking equivalent tool pages across languages, plus an `x-default` fallback.
- **Open Graph + Twitter Card metadata** per page for social sharing previews.
- **`SoftwareApplication` schema.org structured data** on each tool page (name, description, category, price = free, operating system = web).
- **`FAQPage` schema** where the page includes an FAQ section — supports rich results and reinforces genuine content depth beyond the widget.
- **Genuine explanatory content per tool page** (what it does, how to use it, common questions) — thin, template-only tool pages are a known ranking risk; each page should read as useful on its own, not just a widget wrapper.

### 6.2 `robots.txt`

- Allow crawling of all public tool and content pages.
- Disallow any internal/utility routes (e.g., API endpoints, `/api/`, temp processing routes).
- Include a `Sitemap:` directive pointing to the sitemap index.

```
User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://yourdomain.com/sitemap-index.xml
```

### 6.3 Sitemap

- **Sitemap index** referencing per-language sitemaps (`sitemap-en.xml`, `sitemap-de.xml`, etc.) for clarity at scale.
- Auto-generated at build time (Astro sitemap integration) so new tool/language pages are always included without manual maintenance.
- Submitted to Google Search Console and Bing Webmaster Tools per language property.

### 6.4 Speed / Core Web Vitals

- **Static-generate (SSG) every tool and content page** at build time; avoid client-side rendering for anything crawlable.
- **Zero JS by default** on non-interactive page content (Astro islands) — only the active tool widget hydrates.
- **Lazy-load processing libraries** (`pdf-lib`, `pdf.js`, `jsPDF`) only when the user initiates an upload — never on initial page load.
- **Optimize and lazy-load all images** (icons, illustrations) with modern formats (WebP/AVIF) and explicit width/height to avoid layout shift.
- **Self-host fonts** with `font-display: swap` to avoid render-blocking and layout shift.
- **Target Lighthouse scores of 90+** across Performance, SEO, Accessibility, and Best Practices on every tool page before launch.

### 6.5 Content/keyword strategy

- Per-language keyword research done natively (not translated) before writing each localized page, per the earlier DACH research approach.
- Prioritize long-tail, intent-specific phrasing over head terms at launch (e.g., "merge pdf without uploading" before competing head-on for "merge pdf").
- Internal linking between related tools (e.g., Merge → Split → Compress) on every tool page to spread authority and support discovery.

---

## 7. Non-Functional Requirements

- **Privacy:** No file uploaded to a server for any tool marked "client-side" in this document; clearly disclose in the UI and a dedicated Privacy page which tools use server fallback (CSV/table extraction, OCR) and why.
- **Reliability:** Server-fallback services (table extraction, OCR) must fail gracefully with a clear user-facing message if unavailable — never a silent failure.
- **Security:** Any server-side processing (table extraction fallback) must not persist uploaded files beyond the processing request; delete immediately after response.
- **Legal clarity:** Sign PDF and any similar feature must include clear in-product language that it is not a certified/legally-binding digital signature service, to avoid regulatory or user-trust issues.

---

## 8. Roadmap Summary

| Phase                | Scope                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1 (Launch)** | Merge, Split, Lock, Unlock, PDF↔JPG, CSV↔PDF, JPG→CSV — English, full SEO infrastructure (sitemap, robots.txt, schema, metadata) in place from day one |
| **Phase 2**          | Draw, Write, Create, Sign (basic) — plus first additional language (German), with natively researched keywords and content                             |
| **Phase 3**          | Edit PDF, Fill out PDF, Share PDF — plus additional languages (Portuguese, Italian), each treated as its own SEO project                               |

---

## 9. Open Decisions (need answers before/during build)

- [ ] Final domain name (clean, no trademark conflict — see prior naming discussion)
- [ ] Whether "Share PDF" ships at all, and if so, what storage/expiry/privacy model
- [ ] Whether Sign PDF needs any jurisdiction-specific legal disclaimer review
- [ ] Which server host for the Python table-extraction fallback (Fly.io vs. Railway vs. other)
- [ ] Analytics choice: Plausible vs. GA4
