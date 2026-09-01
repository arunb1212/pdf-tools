# Design System Inspired by Fastlane

> Auto-extracted from `https://www.usefastlane.ai/` on 2026-09-01

**Key Characteristics:**

- GeistSans as the heading font (custom web font loaded via @font-face)
- GeistSans as the body font for all running text
- Heading weight 500, letter-spacing -3.44px
- Light/white background (#ffffff) as the primary canvas
- Primary accent `#ff2e2e` used for CTAs and brand highlights
- 8 shadow level(s) detected — tinted shadows
- Rounded corners (50px+) creating a friendly, approachable feel
- Tags: light, rounded, accented, bold-typography, monospace, sans-serif

## 2. Color Palette & Roles

### Primary

- **Primary Accent** (`#ff2e2e`) · `--color-primary`: Brand color, CTA backgrounds, link text, interactive highlights.
- **Secondary Accent** (`#ff5a3c`) · `--color-secondary`: Secondary brand, hover states, complementary highlights.
- **Background** (`#ffffff`) · `--color-bg`: Page background, primary canvas.

### Text

- **Text Primary** (`#121111`) · `--color-text`: Headings and body text.
- **Text Secondary** (`#666666`) · `--color-text-secondary`: Muted text, captions, placeholders.

### Borders & Surfaces

- **Border** (`#111111`) · `--color-border`: Dividers, outlines, input borders.

### Full Extracted Palette

| #   | Hex       | CSS Variable  | Role   | Area   | Contrast   |
| --- | --------- | ------------- | ------ | ------ | ---------- |
| 1   | `#111111` | `--palette-1` | block  | large  | text-light |
| 2   | `#ffffff` | `--palette-2` | badge  | large  | text-dark  |
| 3   | `#f4f2f0` | `--palette-3` | block  | large  | text-dark  |
| 4   | `#ff2e2e` | `--palette-4` | badge  | medium | text-light |
| 5   | `#000000` | `--palette-5` | button | medium | text-light |
| 6   | `#1a1a1f` | `--palette-6` | badge  | small  | text-light |
| 7   | `#ff5a3c` | `--palette-7` | badge  | small  | text-dark  |

## 3. Typography Rules

- **Heading Font:** `GeistSans` (web font)
- **Body Font:** `GeistSans` (web font)

### Type Hierarchy

| Role | Font      | Size | Weight | Line Height | Letter Spacing |
| ---- | --------- | ---- | ------ | ----------- | -------------- |
| H1   | GeistSans | 86px | 500    | 83.42px     | -3.44px        |
| H2   | GeistSans | 64px | 500    | 64px        | -3.2px         |
| H3   | GeistSans | 46px | 500    | 45.08px     | -1.38px        |
| Body | GeistSans | 18px | 400    | 27px        | normal         |
| Code | Times     | 16px | 400    | normal      | normal         |

### Type Scale

| Token   | Size   | Suggested Usage        |
| ------- | ------ | ---------------------- |
| Display | `86px` | headings               |
| H1      | `64px` | headings               |
| H2      | `60px` | headings               |
| H3      | `46px` | headings               |
| H4      | `40px` | headings               |
| Body L  | `30px` | body / supporting text |
| Body    | `26px` | body / supporting text |
| Small   | `24px` | body / supporting text |
| XS      | `22px` | body / supporting text |
| Caption | `21px` | body / supporting text |

## 4. Component Stylings

### Primary Button

```css
.btn-primary {
  background: #16151a;
  color: #ffffff;
  border-radius: 9px;
  padding: 0px 18px;
  font-size: 14.5px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}
```

### Filled Button

```css
.btn-filled {
  background: #ff2e2e;
  color: #ffffff;
  border-radius: 8px;
  padding: 0px 22px;
  font-size: 15px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}
```

### Filled Button 2

```css
.btn-filled-2 {
  background: #16151a;
  color: #ffffff;
  border-radius: 8px;
  padding: 0px 22px;
  font-size: 15px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}
```

### Ghost Button

```css
.btn-ghost {
  background: transparent;
  color: #121111;
  border-radius: 0px;
  padding: 0px 0px;
  font-size: 16px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Outline Button

```css
.btn-outline {
  background: transparent;
  color: #161313;
  border-radius: 50px;
  padding: 1px 6px;
  font-size: 13.3333px;
  font-weight: 400;
  border: 1px solid rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
```

### Pill Button

```css
.btn-pill {
  background: #1a1a1f;
  color: #000000;
  border-radius: 999px;
  padding: 3px 3px;
  font-size: 13.3333px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Card

```css
.card {
  background: #15100f;
  border-radius: 26px;
  padding: 0px;
  box-shadow:
    rgba(255, 60, 50, 0.28) 0px 30px 60px 0px,
    rgba(0, 0, 0, 0.08) 0px 10px 24px 0px;
}
```

## 5. Layout Principles

- **Base spacing unit:** `18px` — use multiples (36px, 54px, 72px, etc.)

### Spacing Scale (extracted from real elements)

| Token     | Value   | Role    |
| --------- | ------- | ------- |
| spacing-1 | `18px`  | element |
| spacing-2 | `120px` | section |
| spacing-3 | `4px`   | element |
| spacing-4 | `5px`   | element |
| spacing-5 | `14px`  | element |
| spacing-6 | `22px`  | element |
| spacing-7 | `7px`   | element |
| spacing-8 | `12px`  | element |

### Border Radius Scale

| Token         | Value  | Element |
| ------------- | ------ | ------- |
| radius-card   | `50px` | card    |
| radius-card   | `18px` | card    |
| radius-card   | `16px` | card    |
| radius-card   | `20px` | card    |
| radius-button | `8px`  | button  |
| radius-button | `12px` | button  |

## 6. Depth & Elevation

| Level | Shadow                                                                                | Usage                      |
| ----- | ------------------------------------------------------------------------------------- | -------------------------- |
| Deep  | `rgba(0, 0, 0, 0.45) 0px 22px 44px 0px`                                               | Hero sections, deep layers |
| Deep  | `rgba(20, 17, 17, 0.1) 0px 18px 44px 0px, rgba(20, 17, 17, 0.05) 0px 4px 12px 0px...` | Hero sections, deep layers |
| Deep  | `rgba(0, 0, 0, 0.08) 0px 10px 30px 0px, rgba(0, 0, 0, 0.04) 0px 2px 8px 0px`          | Hero sections, deep layers |
| Low   | `rgba(0, 0, 0, 0.06) 0px 1px 2px 0px, rgba(0, 0, 0, 0.04) 0px 1px 1px 0px`            | Cards, subtle elevation    |
| Low   | `rgba(0, 0, 0, 0.4) 0px 1px 2px 0px`                                                  | Cards, subtle elevation    |

## 7. Do's and Don'ts

### Do

- Use `#ffffff` as the primary background color
- Use `GeistSans` for all headings and `GeistSans` for body text
- Use `#ff2e2e` as the single dominant accent/CTA color
- Maintain `18px` as the base spacing unit — all gaps should be multiples
- Use rounded corners (`50px`+) consistently for all interactive elements
- Make headlines large and bold — typography is the hero element
- Apply the shadow system for elevation — use the extracted shadow values
- Use weight 500 for headings to match the brand's typographic voice

### Don't

- Don't use colors outside the extracted palette without justification
- Don't substitute GeistSans/GeistSans with generic alternatives
- Don't use irregular spacing — stick to 18px grid
- Don't use dark/black backgrounds — this is a light-themed design
- Don't use sharp corners — they feel hostile in this rounded design language
- Don't use pure black (#000000) for text — use `#121111` instead
- Don't add decorative elements not present in the original design — no badges, ribbons, banners, or ornaments unless the source site uses them
- Don't invent UI patterns the source site doesn't have — if the original has no NEW badge, don't add one just because a red is in the palette

## 8. Responsive Behavior

| Breakpoint | Width       | Notes                                                 |
| ---------- | ----------- | ----------------------------------------------------- |
| Mobile     | < 640px     | Single column, stack sections, reduce font sizes ~80% |
| Tablet     | 640–1024px  | 2-column where appropriate, maintain spacing ratios   |
| Desktop    | 1024–1440px | Full layout as designed                               |
| Wide       | > 1440px    | Max-width container, center content                   |

- Touch targets: minimum 44×44px on mobile
- Maintain 18px base unit across breakpoints — only scale multipliers

## 9. Agent Prompt Guide

### Quick Color Reference

```
Background:  #ffffff
Text:        #121111
Accent:      #ff2e2e
Secondary:   #ff5a3c
Border:      #111111
```

### Example Prompts

1. "Build a hero section with a `#ffffff` background, `GeistSans` heading in `#121111`, and a `#ff2e2e` CTA button with 9px radius."
2. "Create a pricing card using background `#ffffff`, border `#111111`, `GeistSans` for text, and 54px padding."
3. "Design a navigation bar — `#ffffff` background, `#121111` links, `#ff2e2e` for active state."
4. "Build a feature grid with 3 columns, 54px gap, each card using the card component style."
5. "Create a footer with `#121111` background, `#ffffff` text, and 36px padding."

### Iteration Guide

1. Start with layout structure (sections, grid, spacing)
2. Apply colors from the palette — background first, then text, then accents
3. Set typography — font families, sizes from the type scale, weights
4. Add components — buttons, cards, inputs using the specs above
5. Apply border-radius consistently across all elements
6. Add shadows for depth — use the extracted shadow values, not defaults
7. Check responsive behavior — test mobile and tablet layouts
8. Final pass — verify all colors match, spacing is consistent, fonts are correct

## 10. CSS Custom Properties

> 44 custom properties extracted from `:root` / `html` stylesheets.

### Color Variables

| Variable                    | Value                                         |
| --------------------------- | --------------------------------------------- |
| `--ink`                     | `#121111`                                     |
| `--ink-soft`                | `#1d1d1f`                                     |
| `--body`                    | `#51515a`                                     |
| `--muted`                   | `#8a8a90`                                     |
| `--on-dark`                 | `#f5f5f7`                                     |
| `--on-dark-soft`            | `#a8a8ad`                                     |
| `--red`                     | `#ff2e2e`                                     |
| `--red-deep`                | `#e01d1d`                                     |
| `--orange`                  | `#ff6a00`                                     |
| `--orange-soft`             | `#ff8a3d`                                     |
| `--maroon`                  | `#2b0b08`                                     |
| `--blue`                    | `#09f`                                        |
| `--bg`                      | `#fff`                                        |
| `--bg-warm`                 | `#faf8f6`                                     |
| `--bg-warm-2`               | `#f3efec`                                     |
| `--card`                    | `#f4f2f0`                                     |
| `--card-2`                  | `#efe9e5`                                     |
| `--black`                   | `#0a0a0a`                                     |
| `--black-2`                 | `#111014`                                     |
| `--line`                    | `#00000014`                                   |
| `--line-2`                  | `#0000001f`                                   |
| `--line-dark`               | `#ffffff1a`                                   |
| `--shadow-sm`               | `0 1px 2px #0000000f, 0 1px 1px #0000000a`    |
| `--shadow-md`               | `0 10px 30px #00000014, 0 2px 8px #0000000a`  |
| `--shadow-lg`               | `0 30px 60px #0000001f, 0 8px 20px #0000000f` |
| `--apollo-sidebar-hover-bg` | `#0000000a`                                   |
| `--apollo-sidebar-focus-bg` | `#00000014`                                   |

### Spacing Variables

| Variable                         | Value    |
| -------------------------------- | -------- |
| `--radius-sm`                    | `10px`   |
| `--radius`                       | `16px`   |
| `--radius-lg`                    | `24px`   |
| `--radius-xl`                    | `34px`   |
| `--maxw`                         | `1180px` |
| `--gutter`                       | `24px`   |
| `--section-y`                    | `120px`  |
| `--apollo-sidebar-button-size`   | `40px`   |
| `--apollo-sidebar-icon-size`     | `20px`   |
| `--apollo-sidebar-hover-opacity` | `0.8`    |
| `--apollo-sidebar-z-input`       | `2`      |
| `--apollo-sidebar-z-icon`        | `1`      |

### Typography Variables

| Variable         | Value                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--font-display` | `var(--font-geist-sans,"Geist"), "Geist Placeholder", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| `--font-body`    | `var(--font-geist-sans,"Geist"), "Geist Placeholder", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| `--font-mono`    | `var(--font-geist-mono,"Geist Mono"), ui-monospace, "SF Mono", Menlo, monospace`                                         |
| `--font-alt`     | `var(--font-figtree,"Figtree"), var(--font-body)`                                                                        |

### Other Variables

| Variable                      | Value           |
| ----------------------------- | --------------- |
| `--apollo-sidebar-transition` | `all 0.2s ease` |
