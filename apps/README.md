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

Push: the server pushes every bell row through FCM (`src/lib/push`); the app
registers its token with `PUT /api/v1/me/devices/{installationId}` after
sign-in and unregisters on sign-out. Real delivery needs the Apple team: an
APNs auth key uploaded to Firebase (Project settings → Cloud Messaging), and
`aps-environment` switched to `production` for release builds.

### Against the local backend

Debug builds talk to production unless launched with `-emulator YES`, which
points Firebase at the emulators (project `demo-resonance`) and the API at
`http://127.0.0.1:3100`:

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

Push: the server pushes every bell row through FCM (`src/lib/push`, on the "activity" channel); the app
asks for the notification permission once signed in (API 33+), registers its token with
`PUT /api/v1/me/devices/{installationId}` (again on a new token or a language change) and
unregisters on sign-out. Real delivery needs a build against production (not `--ez emulator true`)
on a device with Google Play services.
