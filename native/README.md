# Shared with the native apps

What the web and the two apps (`apps/ios`, `apps/android`) share, so the web stays the single
source. The feasibility spikes (S1–S6) that once lived here were removed once the apps shipped;
they are in git history before 2026-10-11.

| | What | Used by |
| --- | --- | --- |
| `geometry/swift`, `geometry/kotlin` | the hand-drawn geometry (`src/lib/design`) ported exactly | the iOS DesignSystem package, the Android build (`includeBuild`) |
| `editor/` | the story editor island (`npm run native:editor` → `editor/dist/editor.html`, not committed) | both apps' writer, in a WebView |
| `fixtures/geometry.json` | golden geometry from the TypeScript (`scripts/native/geometry-fixtures.ts`) | the geometry packages' and apps' tests |
| `fixtures/markdown-corpus*.json` | how each kind of story content round-trips through the editor | `editorSchema.test.ts`, both apps' story parsers |
| `fixtures/story-link-cards.json` | which links stand alone and get a preview card | the web, the server, both apps |
| `fixtures/card-colours.json` | the cards' palette | the web and both apps |
| `fonts/` (not committed) | the full font files `scripts/native/fetch-fonts.sh` downloads, which `subset-fonts.py` cuts into `apps/shared/fonts` | rarely, when the fonts change |

## Checks

```bash
cd native/geometry/swift && swift test
cd native/geometry/kotlin && ./gradlew test
```

After changing `src/lib/design`, regenerate the golden geometry with
`npx tsx scripts/native/geometry-fixtures.ts`; after changing the editor schema, see CLAUDE.md
(Story editor & its Markdown).
