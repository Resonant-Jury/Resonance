# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build
npm run lint       # ESLint (flat config, plain `eslint .`)
npm run typecheck  # tsc --noEmit
npm test           # Vitest, single run (CI mode)
npm run test:watch # Vitest in watch mode
npm run test:ui    # Vitest browser UI
```

## Architecture

**Resonance**（共振）is a multilingual social storytelling platform built around "story cards" — users write cards, respond to others by authoring a *resonance* (a response card with a `referenceCardId`, **not** a like), and form one-to-one connections via invites. Built with Next.js 15 (App Router) + React 19 + TypeScript 5.7 (strict). No Tailwind — all styling uses CSS Modules + CSS custom properties defined in `src/styles/tokens.css`. See `README.md` for the full architecture write-up (in Chinese).

Stack: Firebase Auth + session cookies, Cloud Firestore, Cloudflare R2 (object storage), OpenAI (slugs/tags/illustrations), Tiptap 3 editor + react-markdown reader, SWR for client data fetching. Deployed on Vercel (region `hnd1`).

### Routing & i18n

`src/middleware.ts` intercepts all requests and routes through `[locale]` (supports `en` and `zh-TW`, `localePrefix: 'always'`). The `next-intl` plugin handles server-side translations; message files live in `src/messages/{locale}.json`. The path alias `@/*` maps to `src/*`. Note: `next.config.ts` lists `firebase`/`firebase-admin` in `serverExternalPackages` to avoid Webpack vendor-chunk require errors.

App routes under `src/app/[locale]/`:

- `page.tsx` — marketing landing page (`SiteHeader → HeroSection → CardFeedSection → CTASection → SiteFooter`)
- `(auth)/` — `signin`, `signup`
- `(app)/` — `home` (feed), `me`, `settings`, `messages` (DMs), `write/[id]` (editor), `card/[slug]` (card page), `u/[handle]` (public profile)

### Authentication

1. Browser signs in with the Firebase client SDK (Google / Email; phone OTP behind `NEXT_PUBLIC_ENABLE_PHONE_OTP`) and gets an ID token.
2. `POST /api/auth/session` exchanges it for an httpOnly session cookie (`__session`, signed by firebase-admin); `DELETE` logs out.
3. Server code verifies the cookie via `requireUser()` / `getCurrentUser()` in `src/lib/auth`.
4. Client-side Firestore reads depend on Firebase Auth state restoration — hooks like `useCard` wait for auth to settle before querying, so anonymous-read rules (public cards/profiles) don't misfire.

### Data Layer (dual-track Firestore)

- **Server side**: `src/lib/db/firestore/*.ts` — repository classes (`FirestoreCardRepository`, `FirestoreUserRepository`, plus connection/invite/resonance/notification) using the admin SDK, enforcing visibility (`public` / `connections` / `private`) in code. Connections use a sorted `uid1_uid2` pair id.
- **Client side**: `src/lib/db/firestore/client/*` — direct read/write modules (cards, feed reads, invites, resonances, notifications, profile, cardLinks) consumed by SWR hooks in `src/lib/data/hooks.ts`; security is enforced by `firebase/firestore.rules`.

Core entities live in `src/lib/db/types.ts`: `Card` (with `translations`, `tags`, `slug`, counters), `User` (`handle`/`handleLower`), `Connection`, `Invite`, `Resonance`, `CardLink`, `Notification`. `src/lib/adapters/` converts Firestore data to UI models.

After editing `firebase/firestore.rules` or `firebase/firestore.indexes.json`, deploy from the `firebase/` directory (that's where `firebase.json` lives — the command fails at repo root): `cd firebase && firebase deploy --only firestore:rules,firestore:indexes`.

### API Routes (`src/app/api/`)

| Route | Purpose |
| --- | --- |
| `POST/DELETE /api/auth/session` | ID token ↔ session cookie / logout |
| `GET /api/cards/resolve?key=` | slug or legacy doc id → Firestore doc id (id only, no content) |
| `POST /api/cards/slug` | generate an English slug on publish (LLM-translated title, collision-safe, idempotent) |
| `POST /api/cards/tags` | LLM suggests 2–3 tags, informed by the author's tag history |
| `POST /api/cards/insight` | pre-publish "mirror moment": distills the draft's core insight for the publish panel (returns only `coreInsight`) |
| `POST /api/cards/index` | builds/refreshes a card's recommendation index entry (insight signature + vectors); fire-and-forget after publish, owner-gated |
| `GET /api/recommend/feed` | reader's recommended feed — daily cached result, LLM funnel only on cache miss; returns card ids + reasons |
| `POST /api/generate-image` | doodle-style illustration from story text → AVIF → R2 (`maxDuration: 120`) |
| `POST /api/upload` | image upload proxy to R2 (works around client-to-R2 TLS issues), 8 MB limit |
| `POST /api/revalidate` | authenticated `revalidatePath` on allowlisted paths (expands locale prefixes) |

### AI (`src/lib/ai/`)

Card URLs use English slugs (LLM translates the title, then slugify + handle/numeric-suffix collision handling). `openai.ts` wraps API calls, `tasks.ts` defines the tasks (slug base, tag suggestions, story illustration), `slugify.ts`/`tags.ts` are pure logic with tests. OpenAI is only called from server routes — the key never reaches the client.

### Storage & Image Pipeline

`src/lib/storage/` is an abstraction over Cloudflare R2 (S3-compatible API via `@aws-sdk/client-s3`). Images are compressed client-side (`src/lib/images/compress.ts`), uploaded through `/api/upload` or `/api/generate-image`, converted to AVIF with sharp (`src/lib/storage/image.ts`), and served from `R2_PUBLIC_BASE`. R2 CORS config is in `r2-cors.json`.

### Component Hierarchy

Components follow a three-tier atomic structure:

- **`atoms/`** — Primitive visual elements. Many generate procedural SVG shapes (e.g., `HandDrawnBorder`, `OrganiBlob`, `ShapeGrain`) using utilities in `src/lib/design/`.
- **`molecules/`** — Composed components (`StoryCard`, `CardEditor`, `CardDetail`, `EmbedStoryCard`, `Modal`, `Panel`, `PageShell`).
- **`sections/`** — Full page sections (`AppHeader`, `HeroSection`, `CardFeedSection`, …).

When building UI, reuse existing primitives (`OrganicButton`, `Panel`, `Field`, `Icon`, `TagPill`, `PageShell`) instead of inline styles or duplicated SVG.

### Design System

All design tokens are CSS variables in `src/styles/tokens.css`, using the **OKLCH color space**. Fonts: Playfair Display (headings) + DM Sans (body). Hand-drawn border stroke widths must use the `INK` / `INK_LIGHT` / `INK_STRONG` "one pen" tokens from `src/lib/design/strokes.ts` — never hardcode `strokeWidth`. A runtime `TweaksPanel` provider (`src/components/providers/TweaksPanel.tsx`) exposes accent color, card density, and grain intensity as live CSS variable overrides — useful for design iteration.

### Organic/Procedural SVG

The visual identity relies on hand-drawn aesthetics generated at runtime:

- `src/lib/design/wobRect.ts` — wobbly rounded rectangles via seeded bezier curves
- `src/lib/design/prng.ts` — seeded PRNG for deterministic per-element randomness
- `src/lib/design/wavyPath.ts` — wavy SVG path generation (plus `wobCircle.ts`)

Shapes use a `seed` prop so they render consistently across SSR and client hydration.

## Testing

Tests run on **Vitest** + **@testing-library/react** + **jsdom**. Config is `vitest.config.ts`; shared setup is in `test/`. We write **integration-style unit tests** — exercise a whole feature (an adapter's rules, a hook's composition, a component's interaction), not single trivial functions. No E2E.

### Where tests live

- **Co-locate** unit/component tests next to their source: `Foo.tsx` → `Foo.test.tsx`, `foo.ts` → `foo.test.ts`. This is the default.
- **`test/`** holds only shared infra, not test cases:
  - `test/setup.ts` – global setup (jest-dom matchers, `afterEach` cleanup, jsdom `ResizeObserver`/`matchMedia` stubs that organic atoms need via `useElementSize`/`useIsMobile`).
  - `test/render.tsx` – `renderWithIntl()` wraps a component in `NextIntlClientProvider` (loads real `en` messages so assertions hit real copy); also re-exports the Testing Library surface + `userEvent`.

### Environment & the jsdom directive

Default env is **node** (fast – suits pure-logic suites). Any test that renders React must opt into jsdom with a top-of-file directive:

```ts
// @vitest-environment jsdom
```

`tsconfig.json` uses `jsx: "preserve"` for Next, so the Vitest config sets `esbuild.jsx: 'automatic'` – test files don't import React. `vitest.config.ts` is excluded from `npm run typecheck` (build tooling, dual-Vite type noise).

### Conventions

- **Mock at the module boundary**, not internals. Hooks/components that touch Firebase mock the read/write layer (`@/lib/db/firestore/client/*`), `useAuth`, and navigation (`@/i18n/navigation`) with `vi.mock`. Pure-logic suites (adapters, mappers, design utils) mock nothing.
- **SWR hooks**: render via `renderHook` wrapped in `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` so each test gets an isolated cache; `await waitFor(() => expect(result.current.data).toBeDefined())`.
- **Query by role / label / text**, asserting the behavior a user sees – avoid implementation details.
- **Component gotchas**: for a control gated by a `pointer-events: none` wrapper, use `userEvent.setup({ pointerEventsCheck: 0 })` to test the component's own validity gate. For long text input, prefer `fireEvent.change` over `userEvent.type`. Await async effects (e.g. a `useEffect` data load) before a test ends to avoid `act()` warnings.
- **Determinism**: seeded design utils (`prng`, `wobRect`, `wavyPath`) are tested for same-seed stability – this is what guarantees SSR/CSR hydration parity.

### Verification (hard rules)

These are non-negotiable — both rules exist because their violation has already shipped regressions:

- **UI changes**: before calling the work done, verify in the browser preview at **both desktop and mobile** widths (`preview_resize`). Mobile-only fixes have silently broken the desktop layout before (and vice versa), and a fix to one organic component must be checked against its siblings (buttons, inputs, selects, toggles share the same border language).
- **Data-layer changes** (repositories, `client/*` read-write modules, adapters, page data fetching): ship with an integration-style test that fails without the change. A Server-Render→Firestore migration once broke the home feed and card pages while the whole suite stayed green.

## Deployment & CLI Tooling

The local environment has the following CLIs installed and authenticated:
1. **Firebase CLI** (`firebase`)
2. **Cloudflare CLI** (`wrangler`)
3. **Vercel CLI** (`vercel`)

For any deployment or configuration update needs, use these CLIs directly. Login is already complete. If you are logged out or experience authentication failures, notify the user so they can re-authenticate.
