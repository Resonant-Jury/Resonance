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
  shared/fonts/             subset fonts for both apps (committed)
native/geometry/            the hand-drawn geometry in Swift and Kotlin (used by the apps)
```

## Generated from the web

```bash
npm run apps:generate   # tokens, string accessors, openapi.json, editor island
```

| Output | From | Script |
| --- | --- | --- |
| `DesignSystem/.../Generated/Tokens.swift` | `src/styles/tokens.css`, StoryCard palette, strokes | `scripts/native/tokens.ts` |
| `ResonanceKit/.../Localization/L10n.swift` | `src/messages/*.json` (bundled as-is, read at runtime) | `scripts/apps/l10n.ts` |
| the Swift API client (at build time) | `openapi/v1/openapi.json` | swift-openapi-generator |
| `apps/shared/fonts/*.ttf` | Noto TC, Playfair, DM Sans, 陳宇落雁 | `scripts/native/subset-fonts.py` (rarely) |

CI fails when the committed tokens or string accessors are stale.

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
every kind of content.

### Against the local backend

Debug builds talk to production unless launched with `-emulator YES`, which
points Firebase at the emulators (project `demo-resonance`) and the API at
`http://127.0.0.1:3100`:

```bash
npm run emulators                       # Auth + Firestore emulators
npx tsx scripts/seed-emulator.ts        # seeded accounts
npm run dev:emulator -- --port 3100     # the web + API on the emulators
xcrun simctl launch booted com.resonance.stories -emulator YES \
  -email alice@resonance.test -password <SEED_PASSWORD from scripts/seed-emulator.ts>
```

`-email`/`-password` sign that seeded account in on launch (emulator builds
only); the sign-in screen also shows an email form in emulator builds.
