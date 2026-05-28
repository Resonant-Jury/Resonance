# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build
npm run lint       # ESLint via Next.js
npm run typecheck  # tsc --noEmit (no test framework yet)
```

## Architecture

**Resonance** is a multilingual marketing/storytelling landing page built with Next.js 15 (App Router) + React 19 + TypeScript 5.7 (strict). No Tailwind — all styling uses CSS Modules + CSS custom properties defined in `src/styles/tokens.css`.

### Routing & i18n

`middleware.ts` intercepts all requests and routes through `[locale]` (supports `en` and `zh-TW`). The `next-intl` plugin handles server-side translations; message files live in `src/messages/{locale}.json`. The path alias `@/*` maps to `src/*`.

### Component Hierarchy

Components follow a three-tier atomic structure:

- **`atoms/`** — Primitive visual elements. Many generate procedural SVG shapes (e.g., `HandDrawnBorder`, `OrganiBlob`, `ShapeGrain`) using utilities in `src/lib/design/`.
- **`molecules/`** — Composed components (`StoryCard`, `Modal`).
- **`sections/`** — Full page sections assembled in `app/[locale]/page.tsx`: `SiteHeader → HeroSection → CardFeedSection → CTASection → SiteFooter`.

### Design System

All design tokens are CSS variables in `src/styles/tokens.css`, using the **OKLCH color space**. Fonts: Playfair Display (headings) + DM Sans (body). A runtime `TweaksPanel` provider (`src/components/providers/TweaksPanel.tsx`) exposes accent color, card density, and grain intensity as live CSS variable overrides — useful for design iteration.

### Organic/Procedural SVG

The visual identity relies on hand-drawn aesthetics generated at runtime:

- `src/lib/design/wobRect.ts` — wobbly rounded rectangles via seeded bezier curves
- `src/lib/design/prng.ts` — seeded PRNG for deterministic per-element randomness
- `src/lib/design/wavyPath.ts` — wavy SVG path generation

Shapes use a `seed` prop so they render consistently across SSR and client hydration.

### Data

Currently all story data is mock (`src/lib/mock/stories.ts`). No API or database layer exists yet.
