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
npm run emulators       # Firebase Auth + Firestore emulators (needs Java; project demo-resonance)
npm run dev:emulator    # Next dev server wired to the emulators (no real Firebase/R2 is touched)
npm run test:emulator   # Rules + Admin SDK suites in test/emulator (starts/stops the emulators itself)
EMULATOR_AUTH_PORT=9199 EMULATOR_FIRESTORE_PORT=8180 npm run emulators:at [-- "<command>"]   # a private pair of emulators beside the shared ones (dev:emulator, seeds and the apps' emulatorAuthPort/emulatorFirestorePort/emulatorApiPort launch args follow the same variables)
npm run moderation -- list [--emulator]   # read the report queue (reports are write-only for clients)
npm run api:openapi     # regenerate openapi/v1/openapi.json from the Zod contract (a test fails when stale)
npm run native:editor   # typecheck + build the native apps' editor island (native/editor/dist/editor.html)
npm run apps:generate   # regenerate what the native apps take from the web (tokens, strings, OpenAPI, editor)
```

Seed the emulators with known test accounts: `npx tsx scripts/seed-emulator.ts`. In a `dev:emulator` browser, sign in from devtools with `await window.__emulatorSignIn(email, password)` (values in the seed script) — that helper exists only in emulator builds.

## Architecture

**Resonance**（共振）is a multilingual social storytelling platform built around "story cards" — users write cards, respond to others by authoring a *resonance* (a response card with a `referenceCardId`, **not** a like), and form one-to-one connections by resonating or leaving a note (older invites can still be answered, none are sent). Built with Next.js 15 (App Router) + React 19 + TypeScript 5.7 (strict). No Tailwind — all styling uses CSS Modules + CSS custom properties defined in `src/styles/tokens.css`. See `README.md` for the full architecture write-up (in Chinese).

Stack: Firebase Auth + session cookies, Cloud Firestore, Cloudflare R2 (object storage), OpenAI (slugs/tags/illustrations), Tiptap 3 editor + react-markdown reader, SWR for client data fetching. Deployed on Vercel (region `hnd1`).

### Routing & i18n

`src/middleware.ts` intercepts all requests and routes through `[locale]` (supports `en` and `zh-TW`, `localePrefix: 'always'`). The `next-intl` plugin handles server-side translations; message files live in `src/messages/{locale}.json`. The path alias `@/*` maps to `src/*`. Note: `next.config.ts` lists `firebase`/`firebase-admin` in `serverExternalPackages` to avoid Webpack vendor-chunk require errors.

App routes under `src/app/[locale]/`:

- `page.tsx` — marketing landing page (`SiteHeader → HeroSection → CardFeedSection → CTASection → SiteFooter`)
- `(auth)/` — `signin`, `signup`
- `(app)/` — `home` (feed), `me`, `settings`, `messages` (DMs), `write/[id]` (editor), `card/[slug]` (card page: ISR, `revalidate = 300`, and `next.config.ts`'s `expireTime: 86400` bounds any stale ISR HTML to a day; a server component seeds `CardDetailClient` through `src/lib/data/cardSeed.ts` — a public card's story is in the HTML, an anonymous card's author never is — and the client replaces it with its own read through the rules; blocks stay client-side, `cardHold.ts` hides the card pre-paint in a signed-in browser until the block list is known), `u/[handle]` (public profile)

### Authentication

1. Browser signs in with the Firebase client SDK (Google / Email; phone OTP behind `NEXT_PUBLIC_ENABLE_PHONE_OTP`) and gets an ID token.
2. `POST /api/auth/session` exchanges it for an httpOnly session cookie (`__session`, signed by firebase-admin); `DELETE` logs out. The browser mints it in the background (`ensureSession()` in `src/lib/auth/firebase/client.ts`: deduped, only when missing or under a day from expiry, remembered in localStorage `resonance:session`); explicit sign-ins await it. `useAuth().loading` ends as soon as the SDK restores the user; only callers of cookie-authenticated `/api` routes wait for `useAuth().sessionReady` — prefer `callApi` (Bearer) for new calls. The sign-in pages keep the popup resolver (Safari blocks the popup otherwise).
3. Server code verifies the cookie or ID token via `requireUser()` / `getCurrentUser()` in `src/lib/auth`, locally. Revocation and disabled state are asked of Firebase Auth live on writes, `/api/account/*`, upload and generate-image; v1 GETs and `/api/recommend/feed` use a per-instance cache (`REVOCATION_CACHE_MS`, 2 min) via `getCurrentUser({ revocation: 'cached' })`. Revoke with `revokeSessions(uid)` (clears the local entry), never a bare `revokeRefreshTokens`. An Auth outage is `AuthUnavailableError` → 500, never a 401.
4. Firestore waits for Auth restoration on its own, so public reads (feed, related, resonances) don't gate on auth; reads of the viewer's own data wait for the user.

### Data Layer (dual-track Firestore)

- **Server side**: `src/lib/db/firestore/*.ts` — repository classes (`FirestoreCardRepository`, `FirestoreUserRepository`, plus connection/invite/resonance/notification) using the admin SDK, enforcing visibility (`public` / `connections` / `private`) in code. Connections use a sorted `uid1_uid2` pair id.
- **Client side**: `src/lib/db/firestore/client/*` — direct read/write modules (cards, feed reads, invites, notifications, profile, cardLinks) consumed by SWR hooks in `src/lib/data/hooks.ts`; security is enforced by `firebase/firestore.rules`. Writes that reach another person or must be unique — publishing, pen names, messages, notes — go through `/api/v1` like the apps (`callApi` in `client/api.ts` sends the ID token as a Bearer token), and the rules refuse them from the browser. What stays client-direct is the author's own drafts and settings, reads, and a few narrowly checked legacy paths. The repo and web config are public: a rule is the only guard on a client write, so every new one needs field-level checks and a `test/emulator/rules.emulator.test.ts` case.
- **Browser SDK**: client modules use Firestore Lite through `src/lib/db/firestore/client/sdk.ts` (writes land in call order; reads wait for this browser's writes in flight) — import from `./sdk`, never `firebase/firestore` (sdk.test.ts fails otherwise). The only realtime surface is `client/realtime.ts` (full SDK), loaded dynamically by an open thread; the two SDKs' Timestamps are different classes, so map listener data by shape. The landing and policy pages load no Firestore for a signed-out visitor; modals and the thought map's editor load on first open (next/dynamic).
- **Signed-in pages read through `/api/v1`**, one request each: the card page's surroundings (`useCardPageLists`: `GET /cards/{id}?include=resonances,related,links,embeds`), a profile (`useProfilePage`: `GET /users/{handle}?include=cards,links`), a thread's shared cards (`useCardSummaries`: `GET /cards?keys=`, 30 per request). Signed-out readers stay on Firestore through the rules; `useReadPath()` picks ('v1' / 'public' / null while auth restores). API summaries become list Cards through `lib/data/summaries.ts` (marked `summary`, never used to prefill a card page); story embeds find their card in `CardEmbedSourceContext` when the page provides one. The card ⋯ (`CardActionsMenu`) changes visibility and deletes through `PATCH`/`DELETE /api/v1/cards/{id}`, which revalidate on the server.
- **SWR defaults** live in `SWRProvider` (`SWR_DEFAULTS`: no focus revalidation, 30 s dedupe); hooks opt back in with `LIVE_ON_FOCUS` (conversations, block list) or keep a short window with `OWN_CONTENT` (anything the viewer edits). Profiles go through one page-wide cache (`getUsersByIds` in `client/reads.ts`: `documentId() in` batches of 30, 5-min TTL; `forgetCachedUser(uid)` after writing a profile). Never batch-read cards with `in` — the rules refuse the whole query when one card is unreadable. List clicks seed the card page's cache (`cardKey()` / `usePrefillCard()` in `src/lib/data/cardPrefill.ts`).

Core entities live in `src/lib/db/types.ts`: `Card` (with `translations`, `tags`, `slug`, counters), `User` (`handle`/`handleLower`), `Connection`, `Invite`, `Resonance`, `CardLink`, `Notification`. `src/lib/adapters/` converts Firestore data to UI models.

After editing `firebase/firestore.rules` or `firebase/firestore.indexes.json`, deploy from the `firebase/` directory (that's where `firebase.json` lives — the command fails at repo root): `cd firebase && firebase deploy --only firestore:rules,firestore:indexes`.

### API Routes (`src/app/api/`)

| Route | Purpose |
| --- | --- |
| `POST/DELETE /api/auth/session` | ID token ↔ session cookie / logout |
| `GET /api/cards/resolve?key=` | slug or legacy doc id → Firestore doc id (id only, no content); CDN-cached an hour on a hit (not longer: a deleted card's slug can be reassigned), never on a miss. The card page doesn't call it (its server render hands over the id) |
| `POST /api/cards/tags` | LLM suggests 2–3 tags, informed by the author's tag history |
| `POST /api/cards/insight` | pre-publish "mirror moment": distills the draft's core insight for the publish panel (returns only `coreInsight`) |
| `POST /api/cards/index` | builds/refreshes a card's recommendation index entry (insight signature + vectors); fire-and-forget after publish, owner-gated |
| `GET /api/recommend/feed` | reader's recommended feed: answers at once from the stored result (`status: 'stale'` while today's is built after the response under a lease — one build per reader, no retry for 1 h after a failure); a first-time reader gets a quick build (≤ 6 s, else vector order without reasons); card ids + reasons + status |
| `POST /api/generate-image` | doodle-style illustration from story text → AVIF → R2 (`maxDuration: 120`) |
| `POST /api/upload` | image upload proxy to R2 (multipart `file`, + `purpose=avatar`). The server re-encodes with sharp (`normalizeUpload`): JPEG/PNG/WebP/GIF only, ≤ 50 MP, EXIF-upright, fit 2048 px (avatar 256), WebP without EXIF/GPS, animated GIF → animated WebP; type and extension come from the encoder. 4 MB request limit, 413 before the body is read (`UPLOAD_MAX_BYTES`; the browser checks first in `uploadImageFile`) |
| `GET /api/og/card/{id}?v=` · `GET /api/og/user/{id}?v=` | og:image: the stored cover / avatar as a JPEG ≤ 1200 px, CDN-cached a day; another `v` gets a 302 to the current one; a card that isn't public and published goes to /og-cover.jpg |
| `POST /api/csp-report` | where the report-only CSP reports go: trimmed, capped `[csp]` log lines, always 204 |
| `POST /api/revalidate` | authenticated `revalidatePath` on allowlisted paths (expands locale prefixes) |
| `GET/POST/DELETE /api/account/deletion` | read / schedule (7-day grace, revokes refresh tokens) / cancel account deletion |
| `GET /api/account/export` | the signed-in user's own writing as a JSON download |
| `GET /api/cron/purge-accounts` | Vercel Cron (daily, `Bearer $CRON_SECRET`): purges accounts past their grace period (`src/lib/account/deletion.ts`) |
| `GET /api/v1/me` · `GET /api/v1/feed` · `GET /api/v1/feed/recommended` | versioned API for the native apps (contract below): the account, latest and recommended feeds (recommended as above, with an optional `status`: `fresh` \| `stale`) |
| `POST/PATCH /api/v1/me` · `GET /api/v1/handles/{handle}` | onboarding and profile edits (pen-name uniqueness checked in the write's transaction), and the as-you-type availability check |
| `GET /api/v1/cards/{key}` (+ `/resonances`, `/related`, `/links`; or `?include=resonances,related,links,embeds` in one request) · `GET /api/v1/cards?keys=` (≤ 30 slugs/ids → summaries in order) · `POST …/report` | a card by slug or id with its story, and the lists around it; reporting it (the server fills in an anonymous author) |
| `POST /api/v1/cards/{id}/publish` | publish your card (web and apps): stamp once, slug (`assignSlug`: LLM-translated title, collision-safe, idempotent), a resonance's connection + bell; the slug is waited for ≤ 8 s (`SLUG_WAIT_MS`), else `slug: null` and it's written after the response; index and cache after the response |
| `GET /api/v1/users/{handle}` (+ `/cards`, `/links`; or `?include=cards,links&limit=`) | a profile as the viewer sees it, their public cards, cards linking to theirs |
| `POST /api/v1/cards/{id}/edits/apply` | apply a published card's pending edit (`cards/{id}/edits/current`) in one transaction, keeping its date and slug |
| `POST /api/v1/notes` · `POST /api/v1/messages` | a note to a card's author (the server finds the author) · a message to a connection (opens the conversation; only the first rings the bell) |
| `PUT/DELETE /api/v1/me/devices/{installationId}` | the apps' push registration: FCM token + UI language in `devices/{installationId}` (no client rule; purged with the account) |
| `PATCH/DELETE /api/v1/cards/{id}` | the owner changes a card's visibility / anonymity, or deletes it (with its pending edit and vectors); both revalidate the cached pages |
| `POST /api/v1/invites/{id}/accept` | accept a legacy invite: invite, connection and bell in one transaction, then the push |
| `GET /api/v1/openapi.json` | the v1 contract, for tools and client generators |

**Push** (`src/lib/push`): every `notifications/*` row is also pushed to the recipient's devices through FCM (`pushNotification`: once-only via `pushedAt`, blocks re-checked, the bell's own `app.notifications.*` copy in each device's language, `data.route` a site path the apps open). Every bell row is written by the server, which rings it with `ringAfter()` after its response (the rules refuse client creates of notifications and connections). Pushes that open a conversation carry `data.fromUserId`. What a push says comes from the records, not the row: the sender's current pen name and, for a note, the note's own text.

**Rate limits** (`src/lib/api/rateLimit.ts`): costly or far-reaching endpoints spend a per-user budget (`spend()` in v1 routes, `limited()` elsewhere) kept in server-only `rateLimits/{uid}_{bucket}`; over budget answers 429 `rate_limited`. A new LLM, upload or notify endpoint should take a bucket.

API routes authenticate with the `__session` cookie **or** `Authorization: Bearer <Firebase ID token>` (native apps) — both via `getCurrentUser()`.

**`/api/v1` is a contract.** Zod schemas in `src/lib/api/v1/schemas.ts` are the source of truth: routes validate with them (`withUser` + `parse` in `http.ts`, errors always `{ error: { code, message, issues? } }`), and `npm run api:openapi` writes `openapi/v1/openapi.json`, from which the iOS (swift-openapi-generator) and Android (openapi-generator) clients are generated. Within v1 change additively only; clients tolerate unknown fields (no `additionalProperties: false`), and optional request fields accept `null` (Kotlin clients send it, Swift omits it). The services (`service.ts`, `reads.ts`; shapes in `present.ts`) run on the Admin SDK, which bypasses `firestore.rules` — every guarantee the rules give the web client (blocks, quotas, visibility) must be re-checked there and covered in `test/emulator/apiV1*.emulator.test.ts` (`canView` in `present.ts` is `cardVisible`). Every v1 GET answers through `cachedJson(req, body, OWN | BRIEF | NEVER)` (`src/lib/api/v1/cache.ts`): always `private`, never `s-maxage`; ETag + 304; `Vary: Authorization, Cookie, X-Resonance-Cache`. The viewer's own things are `no-cache`; others' cards, profiles and lists may be reused 30 s, and the recommended feed until UTC midnight when `fresh` (`no-store` when `stale`) — but only by clients that send `X-Resonance-Cache: 1` (the current apps, whose caches are per account and re-ask after the viewer's writes); everyone else revalidates. Any server path that makes a card non-public, anonymous or gone revalidates its pages with `revalidateLocalized([...cardPagePaths(card), ...profilePagePaths(handle), ...landingPagePaths(before, after)])` from `src/lib/api/revalidate.ts` (the purge's `PurgeReport.pages` does it for the cron). Routes whose parameter is a card id (resonances/related/links, notes' `cardId`, messages' `cardRef`) read by id only (`visibleCardById`); only `GET /cards/{key}` and report resolve slugs (`cardByKey`), before the document read, never beside it. Lists check visibility with `visibleTo()` (one batched connection read per author).

### Safety (App Store 1.2 / 5.1.1(v))

- **Blocking**: `users/{uid}/blocks/{blockedUid}` (owner-only). `blockedBetween()` in the rules refuses connections, messages, invites, notes, notifications and card links across a block, both directions; blocking also deletes the connection. Client reads drop blocked authors in `lib/data/hooks` (`getMyBlockedIds`).
- **Reports**: `reports/*` is create-only for clients; read/resolve with `npm run moderation`.
- **Account deletion**: `accountDeletions/{uid}` (admin-only) → purged by the cron. A new collection that stores a uid must be added to `collectAccountData()` in `src/lib/account/deletion.ts`.

### Story editor & its Markdown

Stories are stored as Markdown, so the editor's schema *is* the storage format. `src/lib/markdown/editorSchema.ts` holds it (nodes + their Markdown serialization, no UI); the web `MarkdownEditor` adds React node views and the native apps' WebView island (`native/editor`) adds DOM ones — both call `storyExtensions()`. `native/fixtures/markdown-corpus.json` pins how each kind of content round-trips (`editorSchema.test.ts`, and the same corpus runs inside both apps). After an intentional schema change: `UPDATE_MARKDOWN_CORPUS=1 npx vitest run src/lib/markdown/editorSchema.test.ts` and review the diff.

### Security headers

`next.config.ts` sends, on every path (`src/lib/api/securityHeaders.ts`): `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and a **report-only** CSP (reports to `/api/csp-report`) listing what the site loads — Firebase Auth's iframe and endpoints, apis.google.com, the R2 image origin, fonts. Watch the `[csp]` logs before enforcing it; a new script, frame, font or API origin must be added there.

### Native apps (`apps/`)

The iOS (SwiftUI, `apps/ios`) and Android (Compose) apps are a migration of this site; see `apps/README.md`. They take their design tokens, strings and editor from the web through `npm run apps:generate` — so renaming or removing a key in `src/messages/*.json`, or changing `tokens.css`, means regenerating (CI fails on stale output). Both apps keep the signed-in account's last answers on disk (latest feed page, today's picks, Me, the published shelf, the block list) for an instant cold start, and send v1 GETs through a per-account HTTP cache that honours `private` + ETag and re-asks after the viewer's own writes (see apps/README.md). The apps read `src/messages` at runtime as-is, with a small ICU subset (`{name}`, `plural` with `=N`/`one`/`other`/`#`); `scripts/apps/l10n.ts` refuses anything else.

### AI (`src/lib/ai/`)

Card URLs use English slugs (LLM translates the title, then slugify + handle/numeric-suffix collision handling). `openai.ts` wraps API calls, `tasks.ts` defines the tasks (slug base, tag suggestions, story illustration), `slugify.ts`/`tags.ts` are pure logic with tests. OpenAI is only called from server routes — the key never reaches the client — and every call carries a timeout (`signal`). Recommendations (`src/lib/recommend`) search the vector store by COSINE distance (smaller = closer).

### Storage & Image Pipeline

`src/lib/storage/` is an abstraction over Cloudflare R2 (S3-compatible API via `@aws-sdk/client-s3`). Images are compressed client-side (`src/lib/images/compress.ts`), uploaded through `/api/upload` or `/api/generate-image`, converted to AVIF with sharp (`src/lib/storage/image.ts`), and served from `R2_PUBLIC_BASE` with `Cache-Control: public, max-age=31536000, immutable` (keys are UUIDs, never rewritten). R2 CORS config is in `r2-cors.json`.

### Component Hierarchy

Components follow a three-tier atomic structure:

- **`atoms/`** — Primitive visual elements. Many generate procedural SVG shapes (e.g., `HandDrawnBorder`, `OrganiBlob`, `ShapeGrain`) using utilities in `src/lib/design/`.
- **`molecules/`** — Composed components (`StoryCard`, `CardEditor`, `CardDetail`, `EmbedStoryCard`, `Modal`, `Panel`, `PageShell`).
- **`sections/`** — Full page sections (`AppHeader`, `HeroSection`, `CardFeedSection`, …).

When building UI, reuse existing primitives (`OrganicButton`, `Panel`, `Field`, `Icon`, `TagPill`, `PageShell`) instead of inline styles or duplicated SVG.

### Design System

All design tokens are CSS variables in `src/styles/tokens.css`, using the **OKLCH color space**. Fonts: Playfair Display (headings) + DM Sans (body) + Noto Serif/Sans TC, self-hosted with next/font in `src/styles/fonts.ts` (variables --font-playfair, --font-dm-sans, --font-noto-serif-tc, --font-noto-sans-tc on `<html>`, from which tokens.css builds --font-heading / --font-body). Hand-drawn border stroke widths must use the `INK` / `INK_LIGHT` / `INK_STRONG` "one pen" tokens from `src/lib/design/strokes.ts` — never hardcode `strokeWidth`. A runtime `TweaksPanel` provider (`src/components/providers/TweaksPanel.tsx`) exposes accent color, card density, and grain intensity as live CSS variable overrides — useful for design iteration.

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
  - `test/fakeAdminDb.ts` – an in-memory Admin Firestore with a `reads` log, for rendering server pages and routes without the emulator.
  - `test/render.tsx` – `renderWithIntl()` wraps a component in `NextIntlClientProvider` (loads real `en` messages so assertions hit real copy); also re-exports the Testing Library surface + `userEvent`.

### Environment & the jsdom directive

Default env is **node** (fast – suits pure-logic suites). Any test that renders React must opt into jsdom with a top-of-file directive:

```ts
// @vitest-environment jsdom
```

`tsconfig.json` uses `jsx: "preserve"` for Next, so the Vitest config sets `esbuild.jsx: 'automatic'` – test files don't import React. `vitest.config.ts` is excluded from `npm run typecheck` (build tooling, dual-Vite type noise).

### Conventions

- **Mock at the module boundary**, not internals. Hooks/components that touch Firebase mock the read/write layer (`@/lib/db/firestore/client/*`), `useAuth`, and navigation (`@/i18n/navigation`) with `vi.mock`. Pure-logic suites (adapters, mappers, design utils) mock nothing.
- **SWR hooks**: render via `renderHook` wrapped in `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` so each test gets an isolated cache; `await waitFor(() => expect(result.current.data).toBeDefined())`. To test focus behaviour use `{ ...SWR_DEFAULTS, provider, dedupingInterval: 0, focusThrottleInterval: 0 }` (SWR ignores focus for 5 s after mount). When a hook returns the raw SWR object, read `.data` during render (`renderHook(() => useX().data)`) — SWR only re-renders for fields a render read. A component rendering CardLinkGrid needs `useAuth` mocked (the prefill reads the viewer).
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
