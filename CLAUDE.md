# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build
npm run lint       # ESLint via Next.js
npm run typecheck  # tsc --noEmit
npm test           # Vitest, single run (CI mode)
npm run test:watch # Vitest in watch mode
npm run test:ui    # Vitest browser UI
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

## Testing

Tests run on **Vitest** + **@testing-library/react** + **jsdom**. Config is `vitest.config.ts`; shared setup is in `test/`. We write **integration-style unit tests** — exercise a whole feature (an adapter's rules, a hook's composition, a component's interaction), not single trivial functions. No E2E.

### Where tests live

- **Co-locate** unit/component tests next to their source: `Foo.tsx` → `Foo.test.tsx`, `foo.ts` → `foo.test.ts`. This is the default.
- **`test/`** holds only shared infra, not test cases:
  - `test/setup.ts` — global setup (jest-dom matchers, `afterEach` cleanup, jsdom `ResizeObserver`/`matchMedia` stubs that organic atoms need via `useElementSize`/`useIsMobile`).
  - `test/render.tsx` — `renderWithIntl()` wraps a component in `NextIntlClientProvider` (loads real `en` messages so assertions hit real copy); also re-exports the Testing Library surface + `userEvent`.

### Environment & the jsdom directive

Default env is **node** (fast — suits pure-logic suites). Any test that renders React must opt into jsdom with a top-of-file directive:

```ts
// @vitest-environment jsdom
```

`tsconfig.json` uses `jsx: "preserve"` for Next, so the Vitest config sets `esbuild.jsx: 'automatic'` — test files don't import React. `vitest.config.ts` is excluded from `npm run typecheck` (build tooling, dual-Vite type noise).

### Conventions

- **Mock at the module boundary**, not internals. Hooks/components that touch Firebase mock the read/write layer (`@/lib/db/firestore/client/*`), `useAuth`, and navigation (`@/i18n/navigation`) with `vi.mock`. Pure-logic suites (adapters, mappers, design utils) mock nothing.
- **SWR hooks**: render via `renderHook` wrapped in `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` so each test gets an isolated cache; `await waitFor(() => expect(result.current.data).toBeDefined())`.
- **Query by role / label / text**, asserting the behavior a user sees — avoid implementation details.
- **Component gotchas**: for a control gated by a `pointer-events: none` wrapper, use `userEvent.setup({ pointerEventsCheck: 0 })` to test the component's own validity gate. For long text input, prefer `fireEvent.change` over `userEvent.type`. Await async effects (e.g. a `useEffect` data load) before a test ends to avoid `act()` warnings.
- **Determinism**: seeded design utils (`prng`, `wobRect`, `wavyPath`) are tested for same-seed stability — this is what guarantees SSR/CSR hydration parity.
