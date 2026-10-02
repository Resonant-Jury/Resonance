# Resonance native apps

The iOS (SwiftUI) and Android (Jetpack Compose) apps. They share the web's
backend (`/api/v1` plus Firebase) and take their design tokens, strings,
fonts and story editor from the web through generators, so the web stays the
single source. The migration plan and its milestones are in the
"共振原生遷移計畫" document; `native/` holds the feasibility spikes (S1–S6)
these apps grew out of.

```
apps/
  ios/                      SwiftUI app (XcodeGen: project.yml)
    Resonance/              app target: App, Session, Navigation, Features/*
    Packages/DesignSystem/  tokens, fonts + CSS line boxes, grain, organic components
    Packages/ResonanceKit/  generated /api/v1 client, auth middleware, localization,
                            StoryFormat (a story's Markdown → the reader's blocks)
  android/                  Compose app (Gradle)
    app/                    the app: session, navigation (Navigation 3), screens
    core/design/            tokens, fonts + CSS line boxes, grain, organic components, story reader
    core/kit/               generated /api/v1 client, localization, story format (JVM, unit-tested)
  shared/fonts/             subset fonts for both apps (committed)
native/geometry/            the hand-drawn geometry in Swift and Kotlin (used by the apps)
```

## Both apps

- **The site**: release builds talk to `https://resonance.channel` (`AppConfig`); the API (`/api/v1`), the
  policy pages, shared card links and pushed paths all follow that origin. The host the site had before,
  `resonance-world.vercel.app`, still serves the same deployment, so builds already installed keep working
  and older links keep opening (see Story links). Android's App Links filter claims the pages the app
  routes on both hosts (`AppLinksTest`); the iOS app declares no associated domains yet, so a site link
  tapped elsewhere opens in Safari.
- **HTTP**: every request goes through one setup (Android `AppHttp.client`, iOS `AppHTTP`) — User-Agent
  `Resonance/<version> (<OS>; build <n>)`, 30 s read/request timeout (15 s connect on Android); the
  illustration stream keeps 150 s. Android API calls run through `blocking`, which cancels the OkHttp
  call when its coroutine is cancelled: a new direct OkHttp call uses `blocking` and `apiClient`.
- **Sign-out / account switch** stops the listeners, then terminates Firestore and clears its local data
  (through `FirebaseBootstrap.db` / `AppFirebase.db` — never keep `Firestore.firestore()` around) before the
  next account's listeners start, and clears delivered notifications, the badge, the push memo and the
  profile mark. Android backup / device transfer keeps only `settings.xml`.
- **Push**: the registration is sent again only when the uid, token, language or app version changes, or
  after 24 h, never twice at once. Notification permission is asked after the first note, message or
  published card (`PushCenter.reachedOut()`): before that nobody can reach the account. The iOS
  installation id is tied to the phone (`identifierForVendor`), so a restored backup gets its own.
- **Live lists** use `LiveListeners`: a failed listener re-attaches on the next foreground or a retry
  button; only permission-denied / not-found means "gone". With nothing loaded yet, a screen shows a retry.
- **The writer** reports a change only when it wrote something (iOS `WriteLauncher.Change`, Android
  `Session.CardChange` / `takeWriterChange`), naming the card and the card it answers. A card page reads
  again only for a change that `concerns` it — its card, or a resonance to it; a change naming no card (a
  block) concerns every page. The thought map is kept by the session per account: a visit within 15
  minutes shows it where it was left, re-reading only the card the writer changed.
- **Story links** (`StoryLink`): relative links and links on the site's host — the origin's, or the one it
  had before (`StoryLink.formerHosts` / `FORMER_HOSTS`; the exact name only, never a look-alike) — open in
  the app, other http(s) links in the in-app browser, `mailto:` as written; any other scheme is plain text.
- **App Check** (watched, not enforced): iOS release builds attest with App Attest (the
  `appattest-environment` entitlement), Android release builds with Play Integrity (src/release);
  debug builds use the debug provider (src/debug on Android) — its token is in Xcode's console /
  Logcat, to register in the Firebase console — and emulator builds none. API calls carry the token
  at hand (`AppCheckHeader`, kept current from the SDK's token listener; Android adds it to
  `/api/` requests only, never the pictures') and never wait for one.
- **Unknown enum values** in an API answer read as the nearest known one (Android `enumUnknownDefaultCase`,
  iOS `OpenEnumsMiddleware`, whose table a test checks against every response enum in openapi.json).

## Generated from the web

```bash
npm run apps:generate   # tokens, string accessors, icons, openapi.json, editor island
```

| Output | From | Script |
| --- | --- | --- |
| `DesignSystem/.../Generated/Tokens.swift` | `src/styles/tokens.css`, StoryCard palette, strokes | `scripts/native/tokens.ts` |
| `ResonanceKit/.../Localization/L10n.swift` | `src/messages/*.json` (bundled as-is, read at runtime) | `scripts/apps/l10n.ts` |
| `DesignSystem/.../Generated/Icons.swift` | the hand-drawn icons in `src/components/atoms/Icon` | `scripts/apps/icons.ts` |
| the same three for Android (`core/design/.../generated/Tokens.kt`, `Icons.kt`, `core/kit/.../l10n/L10n.kt`) | as above | as above |
| the Swift API client (at build time) | `openapi/v1/openapi.json` | swift-openapi-generator |
| the Kotlin API client (at build time) | `openapi/v1/openapi.json` | openapi-generator (`jvm-okhttp4`) |
| `apps/shared/fonts/*.ttf` | Noto TC, Playfair, DM Sans, 陳宇落雁 | `scripts/native/subset-fonts.py` (rarely) |
| `DesignSystem/.../Resources/Flags/flag-*.png`, `core/design/.../drawable-nodpi/flag_*.png` | `public/flags/*.svg` (the art the web's SquareFlag crops) | `scripts/apps/flags.ts` (by hand when a flag is added; not in `apps:generate`, not checked by CI) |

Both apps also bundle the story editor island, `native/editor/dist/editor.html`
(the writing screen's story field). It is built, not committed: run
`npm run native:editor` (or `apps:generate`) before the first app build.

CI fails when the committed tokens, string accessors or icons are stale. The
apps draw only the web's icons (`OrganicIcon`); an icon the web lacks is added
to the web's registry first, so both stay one set.

## iOS

Needs Xcode 27 and XcodeGen.

```bash
cd apps/ios && xcodegen generate
xcodebuild -project Resonance.xcodeproj -scheme Resonance \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build \
  -skipPackagePluginValidation -skipMacroValidation build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Resonance.app
xcrun simctl launch booted com.resonance.stories
```

Tests: `cd Packages/ResonanceKit && swift test` (API client, localization,
story format — on the Mac, in seconds) and `xcodebuild … test` (app).
Launch arguments for checking screens (Debug): `-route /card/<slug>` or
`-route /u/<handle>` opens that page; the seed has `rich-story`, a card with
every kind of content. `-writeTitle "…" -writeStory "…"` start a new card with
that text (the simulator can't type into the fields from outside), and
`-writeCover <url>` with that picture as its cover; `-threadDraft "…"` fills a
conversation's composer (`-route /messages/<handle>` opens one).
`-route /me/thought-map` opens the thought map (the seed gives alice one:
a region, three cards, a labelled arrow).
`-pushToken <any>` registers a stand-in push token under the signed-in
account (`devices/*` in the emulator), and `xcrun simctl push booted
com.resonance.stories <file.apns>` with top-level `route` and `notificationId`
keys checks where tapping a push leads.

`-feedPicksDelay <seconds>` holds back the recommended feed, to see the
late-picks hint.

Reading: a card's page is one `GET /api/v1/cards/{key}?include=resonances,related,links,embeds`
(story embeds come from `embeds`, matched by slug or id with `CardKey.of(href:)`; an unmatched link
stays a plain link), a person's page one `GET /api/v1/users/{handle}?include=cards,links&limit=12`, and
a conversation's shared cards one `GET /api/v1/cards?keys=` (`CardSummaries`). A card's ⋯ visibility
change and delete go through `PATCH`/`DELETE /api/v1/cards/{id}`. A tapped push opens its thread by
`data.fromUserId`. The latest feed and a person's cards page by `nextPageToken` (`FeedPage.next`;
a page without one falls back to `nextCursor`). The card box asks for my own shelves (published,
private, drafts) in one `GET /api/v1/me/cardbox?shelves=`, the others' when shown; whichever answer
brings the published shelf is what's kept. The thought map reads its cards under the rules and asks
`GET /api/v1/cards?keys=` for the ones they refuse (someone else's anonymous original, without its
author). Reports go through the server (`POST /api/v1/reports`, `…/cards/{key}/report`). A scheduled
deletion comes with the account (`Me.deletion`, the kept one on a cold start): no separate request,
and a cancel clears it from the kept account too. The home feed asks for the latest and the recommended cards together.
Picks that arrive within `FeedModel.defaultPatience` (800 ms) lead the feed;
later ones wait behind the "今天的推薦準備好了" pill (TabScreen's `banner`)
and never rearrange what's on screen. Cards seen in lists stay in
`SessionStore.cardPreviews` (memory only, per account, emptied on sign-out
and on any block change) as the card page's placeholder — the page always
refetches. `Route.thread(handle:uid:note:)` takes the uid whenever the caller
knows it; threads listen by pair id, and PERMISSION_DENIED means "no
conversation yet".

Caches: `APICache` (ResonanceKit, Caches/APICache/<sha256(uid)>) keeps the
account's latest feed page, today's picks (UTC day only), Me, the published
shelf and the block list for an instant cold start — filtered by the block list,
removed on sign-out, account switch or scheduled deletion. v1 GETs go through
`APIHTTPCache` (a URLCache and URLSession per account; never `URLSession.shared`
for v1 — build clients with `ResonanceClient.make(_:cache:)`), which honours the
server's `private` + ETag, opts in with `X-Resonance-Cache: 1`, and sends
`no-cache` after the viewer's writes (`SessionStore.noteOwnWrite()` for writes
that go straight to Firestore). Back in the foreground after 15 minutes or on a
new UTC day, `SessionStore.awayRefreshes` refreshes saved screens. The editor
island is served from `resonance-editor://editor/editor.html` by
`EditorPageHandler` with a hash-based CSP: if `scripts/native/build-editor.mjs`
starts loading anything new, update `EditorPage`.

The app hosts its unit tests; run them with `xcodebuild test … -destination
'id=<udid>'`. Under XCTest the app points at a local stack that isn't there
(no backend, not even a simulator's saved account on production) unless the
simulator's defaults say `emulator` (with `emulatorAuthPort`/…), e.g.
`xcrun simctl spawn <udid> defaults write com.resonance.stories emulator -bool YES`.

Push: the server pushes every bell row through FCM (`src/lib/push`); the app
registers its token with `PUT /api/v1/me/devices/{installationId}` after
sign-in (see "Both apps" for when) and unregisters on sign-out. Real delivery needs the Apple team: an
APNs auth key uploaded to Firebase (Project settings → Cloud Messaging), and
`aps-environment` switched to `production` for release builds.

### Against the local backend

Debug builds talk to production (`https://resonance.channel`) unless launched
with `-emulator YES`, which points Firebase at the emulators (project
`demo-resonance`) and the API at `http://127.0.0.1:3100`:

```bash
npm run emulators                       # Auth + Firestore emulators
npx tsx scripts/seed-emulator.ts        # seeded accounts
npx tsx scripts/seed-store-demo.ts      # the store screenshot world (sign in as demo@resonance.test, same password); seed-emulator.ts restores the test world
npm run dev:emulator -- --port 3100     # the web + API on the emulators
xcrun simctl launch booted com.resonance.stories -emulator YES \
  -email alice@resonance.test -password <SEED_PASSWORD from scripts/seed-emulator.ts>
```

`-email`/`-password` sign that seeded account in on launch (emulator builds
only); the sign-in screen also shows an email form in emulator builds.

## Android

Needs JDK 21 and the Android SDK (compileSdk 37); the Gradle wrapper fetches
the rest.

```bash
cd apps/android
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
./gradlew :core:kit:test        # API clients, localization, story format, cover hue
./gradlew :app:testDebugUnitTest  # the app's JVM tests: the origin, routes, App Links, pen names, settings sections, push routing
```

Debug launch extras mirror iOS's arguments: `--ez emulator true` points
Firebase at the emulators (`10.0.2.2`) and the API at `http://10.0.2.2:3100`,
`--es email … --es password …` signs a seeded account in,
`--es route /card/<slug>` (or `/u/<handle>`) opens that page,
`--es writeTitle … --es writeStory …` start a new card with that text, and
`--es threadDraft …` fills a conversation's composer (`--es route /messages/<handle>` opens one),
`--es route /me/thought-map` opens the thought map (the seed gives alice one: a region, three cards, a
labelled arrow; `npx tsx scripts/seed-thought-map-bench.ts` swaps in a 100-card one, `seed-emulator.ts` puts hers back),
and `--es pushToken <any>` registers a stand-in push token under the signed-in account
(`devices/*` in the emulator; it lasts until the process ends, and emulator builds never touch FCM):

```bash
adb shell am start -n com.resonance.stories/com.resonance.app.MainActivity \
  --ez emulator true --es email alice@resonance.test \
  --es password <SEED_PASSWORD from scripts/seed-emulator.ts> --es route /card/rich-story
```

A tapped push starts the app with its data as extras, so `--es route` with `--es notificationId` fakes a
tap (`--es route "''"` for a push with no page of its own: the notifications tab); `--es pushTitle …`
posts the notification a push that arrives while the app is open shows:

```bash
adb shell am start -n com.resonance.stories/com.resonance.app.MainActivity \
  --es route /messages/alice --es notificationId x
```

Reading (tests in `:core:kit`: FeedLoader, CardPageLoader, CardCache): the feed shows the latest cards
first; picks that answer later wait behind the "今天的推薦準備好了" hint. A card page is one
`GET /api/v1/cards/{key}?include=resonances,related,links,embeds` (story embeds from `embeds`, matched
by slug or id; an unmatched link stays plain), a person's page one `GET /users/{handle}?include=cards,links&limit=12`,
and a thread's shared cards one `GET /cards?keys=` per batch of new ids. Lists pass their FeedCard as
`Route.Card(key, preview)` and remember it in `Session.cardCache` (per account; cleared on sign-in/out,
your own card changes and block changes) so the card page draws at once. The card ⋯ (visibility,
delete) goes through `PATCH`/`DELETE /api/v1/cards/{id}`. The feed and a person's cards page by
`nextPageToken` (`NextPage`; the millisecond `nextCursor` only from a server without the token). The card
box reads my own shelves (published, private, drafts) together, one `GET /me/cardbox?shelves=`, and the
other shelves one at a time, when shown. The thought map reads its cards under the rules and asks `GET /cards?keys=` for those
the rules refuse (someone else's anonymous card I resonated with, which comes without its author). Reports
— cards, people, conversations — go through the API (`SafetyApi`), which keeps the evidence. The scheduled
deletion comes with `/me` (`Me.deletion`, kept on disk with the profile): no second request at start.
`--es fromUserId <uid>` (and `--es pushFromUserId`
for the notification posted while the app is open) fake a push carrying its sender's uid; the thread
then opens by uid. `--es route /messages/<handle>` for the thread already on top leaves it
in place.

Navigation and caches: routes are @Serializable NavKeys and each tab's NavBackStack is saved
(rotation, restored processes); pages keep their saved state and their own ViewModels
(lifecycle-viewmodel-navigation3) while on their stack, re-reading only after a card or block change or
after 15 minutes. cacheDir/api is `ApiCache` (per account; cleared on sign-out, deletion or account switch;
the feed filtered by the block list); cacheDir/http is the OkHttp cache via `HttpCaching` (private
max-age/ETag honoured, opted in with `X-Resonance-Cache: 1`; no-cache after the viewer's writes or a block
change; evicted on sign-out). Coil shares the app's OkHttpClient; below Android 12 AVIF goes through the
app's libavif decoder (`--ez avifDecoder true` forces it on any version). The editor WebView loads only
the bundled island; external links open in the in-app browser.

Push: the server pushes every bell row through FCM (`src/lib/push`, on the "activity" channel); the app
asks for the notification permission after the first note, message or publish (API 33+), registers its
token with `PUT /api/v1/me/devices/{installationId}` (see "Both apps" for when) and unregisters on sign-out. Real delivery needs a build against production (not `--ez emulator true`)
on a device with Google Play services.
