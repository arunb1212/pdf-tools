# SEO Audit Checklist

## Multi-Tool PDF Website

**Purpose:** Run this checklist against the live (or staging) site before launch, and re-run it whenever a new tool or language page ships. Each item includes how to check it and what to implement if it's missing.

**How to use:** For each item — check the box if it passes. If it fails or doesn't exist, use the "If missing" snippet/action directly under it.

---

## 1. Technical Foundations

### 1.1 `robots.txt`

**Check:** Visit `https://yourdomain.com/robots.txt` — confirm it exists, allows crawling of tool pages, and references the sitemap.

**If missing**, add at `public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://yourdomain.com/sitemap-index.xml
```

- [ ] File exists and is publicly accessible
- [ ] No accidental `Disallow: /` blocking the whole site
- [ ] Internal/API routes are disallowed
- [ ] Sitemap directive present and URL is correct

---

### 1.2 XML Sitemap

**Check:** Visit `https://yourdomain.com/sitemap-index.xml` — confirm all tool pages and language variants are listed, and it's referenced in Google Search Console.

**If missing**, install and configure for Astro:

```bash
npx astro add sitemap
```

```js
// astro.config.mjs
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://yourdomain.com",
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: { en: "en-US", de: "de-DE", pt: "pt-BR", it: "it-IT" },
      },
    }),
  ],
});
```

- [ ] Sitemap auto-generates at build time (no manual maintenance)
- [ ] Every tool page × every live language is included
- [ ] Sitemap submitted in Google Search Console (per language property if using separate properties)
- [ ] Submitted to Bing Webmaster Tools

---

### 1.3 Canonical Tags

**Check:** View page source on 3–4 tool pages — confirm each has a self-referencing `<link rel="canonical">`.

**If missing**, add to the shared page `<head>` layout:

```html
<link rel="canonical" href={`https://yourdomain.com${Astro.url.pathname}`} />
```

- [ ] Every page has a canonical tag
- [ ] Canonical points to itself (not the homepage or another tool)
- [ ] No conflicting canonicals between paginated/filtered variants

---

### 1.4 HTTPS & Domain Consistency

**Check:** Confirm `http://` redirects to `https://`, and non-www redirects to your chosen canonical version (or vice versa) — pick one and enforce it everywhere.

- [ ] HTTPS enforced site-wide with valid certificate
- [ ] Single canonical domain form (no duplicate www/non-www indexing)
- [ ] No mixed-content warnings in browser console

---

## 2. On-Page Metadata (per tool page, per language)

### 2.1 Title Tags

**Check:** Inspect `<title>` on every tool page — must be unique, include the primary keyword, not truncated in SERPs (~50–60 characters).

**If missing/generic**, template:

```html
<title>{toolName} — Free & Private, No Upload Required | YourBrand</title>
```

- [ ] Every page has a unique title (no duplicates across tools/languages)
- [ ] Primary keyword present, near the front
- [ ] Localized titles are natively written, not machine-translated

### 2.2 Meta Descriptions

**If missing**, template:

```html
<meta
  name="description"
  content="{`${toolAction}"
  directly
  in
  your
  browser
  —
  no
  upload,
  no
  sign-up,
  no
  watermark.
  Free
  forever.`}
/>
```

- [ ] Every page has a unique meta description (~150–160 characters)
- [ ] Includes a clear value prop, not just a keyword restatement

### 2.3 Open Graph / Twitter Cards

**If missing**, add:

```html
<meta property="og:title" content={pageTitle} />
<meta property="og:description" content={pageDescription} />
<meta property="og:image" content={`https://yourdomain.com/og/${toolSlug}.png`} />
<meta property="og:url" content={canonicalUrl} />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

- [ ] OG tags present on every page
- [ ] OG image exists per tool (or a solid shared fallback) — not a broken/default image
- [ ] Preview tested via a social debugger tool

### 2.4 `hreflang` Tags

**Check:** On any page that has language equivalents, confirm hreflang links to every version plus `x-default`.

**If missing**, add per page:

```html
<link rel="alternate" hreflang="en" href="https://yourdomain.com/merge-pdf" />
<link
  rel="alternate"
  hreflang="de"
  href="https://yourdomain.com/de/pdf-zusammenfuegen"
/>
<link
  rel="alternate"
  hreflang="pt"
  href="https://yourdomain.com/pt/juntar-pdf"
/>
<link
  rel="alternate"
  hreflang="x-default"
  href="https://yourdomain.com/merge-pdf"
/>
```

- [ ] All live language variants cross-reference each other
- [ ] `x-default` set
- [ ] URLs in hreflang tags are exact, working canonical URLs (common source of errors)

---

## 3. Structured Data

### 3.1 `SoftwareApplication` Schema

**Check:** Test each tool page in Google's Rich Results Test.

**If missing**, add JSON-LD:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Merge PDF",
    "applicationCategory": "Utility",
    "operatingSystem": "Web",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "url": "https://yourdomain.com/merge-pdf"
  }
</script>
```

- [ ] Every tool page has valid `SoftwareApplication` markup
- [ ] Passes Rich Results Test with no errors

### 3.2 `FAQPage` Schema (where FAQ content exists)

**If missing** on pages with an FAQ section:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is my file uploaded to a server?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No — this tool processes your file entirely in your browser."
        }
      }
    ]
  }
</script>
```

- [ ] FAQ schema present where on-page FAQ content exists
- [ ] Answer text matches visible page content exactly (no cloaking)

---

## 4. Content Quality

- [ ] Each tool page has genuine explanatory content (what it does, how to use it, FAQ) — **not just a bare widget**
- [ ] No thin/duplicate content between similar tool pages (e.g., Merge and Split shouldn't share 90% identical copy)
- [ ] Localized pages are natively written per language, not translated — verify against native-language keyword research, not a translation tool
- [ ] Internal links between related tools present on every page (e.g., Merge → Split → Compress)
- [ ] Clear H1 per page matching page intent; logical H2/H3 hierarchy (no skipped levels, no multiple H1s)

---

## 5. Performance / Core Web Vitals

**Check:** Run Lighthouse (Chrome DevTools or CLI) and PageSpeed Insights on 3–5 representative tool pages (desktop + mobile).

```bash
npx lighthouse https://yourdomain.com/merge-pdf --view
```

| Metric                          | Target  |
| ------------------------------- | ------- |
| LCP (Largest Contentful Paint)  | < 2.5s  |
| INP (Interaction to Next Paint) | < 200ms |
| CLS (Cumulative Layout Shift)   | < 0.1   |
| Lighthouse Performance score    | 90+     |
| Lighthouse SEO score            | 100     |

**If failing:**

- [ ] Confirm PDF processing libraries (`pdf-lib`, `pdf.js`, `jsPDF`) are lazy-loaded on user action, not on page load (`client:visible`/`client:idle` in Astro, or dynamic `import()`)
- [ ] Confirm images use modern formats (WebP/AVIF), explicit dimensions, and lazy loading (`loading="lazy"`)
- [ ] Confirm fonts are self-hosted with `font-display: swap`
- [ ] Confirm no render-blocking third-party scripts above the fold
- [ ] Confirm pages are statically generated (SSG), not client-side rendered

---

## 6. Indexing & Crawlability

**Check in Google Search Console:**

- [ ] No pages incorrectly marked `noindex`
- [ ] Coverage report shows tool pages as "Indexed," not "Discovered — currently not indexed" or "Crawled — not indexed"
- [ ] No 404s or soft-404s on live tool URLs
- [ ] Mobile Usability report shows no errors
- [ ] Core Web Vitals report (field data) matches lab data direction

**If pages aren't indexing:**

- [ ] Check for accidental `<meta name="robots" content="noindex">` left over from staging
- [ ] Manually request indexing via GSC URL Inspection for priority pages
- [ ] Confirm internal linking reaches the page (orphan pages index poorly)

---

## 7. Trust & E-E-A-T Signals

- [ ] Clear "About" page explaining who runs the site
- [ ] Privacy policy explicitly stating which tools process client-side vs. server-side, and what happens to files sent to the server fallback (retention/deletion policy)
- [ ] Contact method available
- [ ] No misleading claims (e.g., don't call basic draw/type signatures "legally binding" without qualification — see PRD Section 7)

---

## 8. Audit Run Log

| Date | Pages audited | Pass/Fail summary | Fixes implemented |
| ---- | ------------- | ----------------- | ----------------- |
|      |               |                   |                   |
|      |               |                   |                   |

---

## Quick Pre-Launch Gate

Before going live, these are non-negotiable:

- [ ] `robots.txt` live and correct
- [ ] Sitemap live, submitted to GSC
- [ ] Every page: unique title, description, canonical
- [ ] `SoftwareApplication` schema on every tool page
- [ ] Lighthouse Performance + SEO ≥ 90 on representative pages
- [ ] No `noindex` tags left from staging
