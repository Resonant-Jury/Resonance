# Native feasibility spikes (S1–S6)

Swift (iOS) and Kotlin (Android) spike apps that test whether Resonance can go
native without losing its hand-drawn design, while keeping one backend. These
are experiments, not the app: each screen answers one question and prints its
measurements (`S1…S6RESULT` lines) so a run can be compared with the web.

| | Question | Where |
| --- | --- | --- |
| S1 | Can the organic geometry be ported exactly? | `geometry/swift`, `geometry/kotlin` (golden fixtures in `fixtures/geometry.json`) |
| S2 | Does a feed of grainy organic cards scroll smoothly? Is the GPU grain the web's noise? | `ios/Sources/S2`, `android/…/s2`, `Grain.metal`, `Grain.kt` (AGSL) |
| S3 | Can hand-drawn bars replace the system ones without losing swipe / predictive back? | `ios/Sources/S3`, `android/…/s3` |
| S4 | Rich editor: WebView island vs native? Does the Markdown round-trip exactly? | `editor/` (island), `ios/Sources/S4`, `android/…/s4`, `fixtures/markdown-corpus.json` |
| S5 | How close does mixed Chinese/English typography get to Chrome? | `ios/Sources/S5`, `android/…/s5`, `typelab/` (web reference) |
| S6 | Can both apps use one backend through a generated, typed client? | `/api/v1` in the web app, `openapi/v1/openapi.json`, `ios/Sources/S6`, `android/…/s6` |

## Setup

```bash
scripts/native/fetch-fonts.sh                     # OFL fonts → native/fonts/
python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools
.venv-fonts/bin/python scripts/native/subset-fonts.py   # ship-ready subset → native/fonts/app/
npm run native:editor                             # editor island → native/editor/dist/editor.html
npx tsx scripts/native/grain-tiles.ts             # grain tiles (already committed)
```

The S6 and S4-with-data runs need the local backend: `npm run emulators`,
`npx tsx scripts/seed-emulator.ts`, `npm run dev:emulator -- --port 3100`.

## iOS

```bash
cd native/ios && xcodegen generate
xcodebuild -project ResonanceSpikes.xcodeproj -scheme ResonanceSpikes \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build \
  -skipPackagePluginValidation build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/ResonanceSpikes.app
xcrun simctl launch --console-pty booted com.resonance.spikes -spike feed -bench all
```

`-spike` takes `curves | feed | grain | nav-system | nav-organic | editor | type | api`;
`-run 1` (or `-bench all`) runs the measurement unattended. S6 also needs
`-email alice@resonance.test -password <SEED_PASSWORD from scripts/seed-emulator.ts>`.

## Android

```bash
cd native/android && ./gradlew :app:assembleRelease   # benchmarks: release (R8), not debug
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.resonance.spikes/.MainActivity --es spike feed --es bench all
adb logcat -s S2
```

Same `spike` names as iOS, as `--es spike …`; `--es run 1` runs unattended.
From the emulator the host machine is `10.0.2.2`. Needs JDK 17+ (Android
Studio's JBR works) and compile SDK 37.

## Checks

```bash
npx tsx scripts/native/grain-parity.ts <dir with grain-probe-*.png> [--scale 2.625]
cd native/geometry/swift && swift test
cd native/geometry/kotlin && ./gradlew test
```
