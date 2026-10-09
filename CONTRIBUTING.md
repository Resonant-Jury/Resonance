# Contributing to Resonance

Thank you for wanting to help. This page says how work is done here, so that a change can be
reviewed and merged without surprises. [CLAUDE.md](CLAUDE.md) is the detailed guide to the
architecture and its rules; this is the short version.

## Before you start

- **Small fixes** (a bug, a typo, a broken layout): open a pull request.
- **Anything bigger** (a feature, a new screen, a change to the API or the data): open an issue
  first and describe the problem, so we can agree on the approach before you write it.
- **Read the product principles.** Resonance rewards writing, not attention. Proposals that add like
  counts, view counts, public comment threads, open messaging between strangers, or engagement-based
  ranking won't be accepted, however small. The reasoning is in
  [docs/product-design-principles.md](docs/product-design-principles.md) (in Chinese).

Set up the project as described in the [README](README.md#getting-started). Work against the local
emulators; never point a development build at production data.

## Branches and worktrees

- Branch from `main`, one topic per branch (`fix/thread-scroll`, `feat/note-drafts`).
- Running several things at once (or several coding agents)? Give each its own worktree beside the
  main checkout, so they never share a working tree:

  ```bash
  git worktree add ../Resonance-<topic> -b <branch> main
  ```

  Each worktree runs its own dev server on its own port. For a private pair of emulators, use
  `EMULATOR_AUTH_PORT=… EMULATOR_FIRESTORE_PORT=… npm run emulators:at`.
- Keep commits small and focused. The subject says what changes for the person using it, in this
  style: `fix: 🔗 a link at the end of a sentence no longer takes the full stop`. Types in use:
  `feat`, `fix`, `copy`, `docs`, `test`, `refactor`, `perf`, `style`, `chore`.

## Tests are required

Every change in behavior comes with a test that **fails without the change**.

- Tests sit next to their code (`Foo.tsx` → `Foo.test.tsx`) and exercise a whole feature: a hook's
  composition, a component's interaction, a route's answers. `test/` holds only shared setup.
- A test that renders React starts with `// @vitest-environment jsdom`. Query by role, label and
  text, as a user would.
- Data-layer changes (repositories, `src/lib/db/firestore/client/*`, adapters, page data) need an
  integration-style test.
- A new or changed Firestore rule needs a case in `test/emulator/rules.emulator.test.ts`. The
  repository and the web config are public, so a rule is the only guard on a client write: check
  keys, types and sizes.
- `/api/v1` is a contract for the apps: change it additively only, update the Zod schemas, run
  `npm run api:openapi`, and cover new server guarantees in `test/emulator/apiV1*.emulator.test.ts`.
- App changes come with their own tests (`swift test` in `apps/ios/Packages/ResonanceKit`,
  `./gradlew :core:kit:test :app:testDebugUnitTest` in `apps/android`).

Before you push:

```bash
npm run lint && npm run typecheck && npm test
npm run test:emulator   # when you touched rules, the server or the API
```

## Strings and copy

- Every word a person sees lives in `src/messages/en.json` **and** `src/messages/zh-TW.json`. No
  hard-coded copy in components or apps.
- One sentence or a fragment ends without a full stop in both languages (no 「。」, no "."); two or
  more sentences keep every stop. `src/messages/punctuation.test.ts` guards the rule; CLAUDE.md
  has the details and the exceptions.
- The apps read the same files. After renaming or removing a key, or changing `tokens.css` or an
  icon, run `npm run apps:generate` and commit the output (CI fails on stale output).
- Write the way the product talks: plain, warm, short. When unsure, look at the strings around yours.

## Design system

The interface is drawn by hand, in code. Please keep it that way:

- Reuse the primitives (`OrganicButton`, `Panel`, `Field`, `Select`, `ToggleSwitch`, `Icon`,
  `TagPill`, `PageShell`, `Divider`) before writing anything new. The checklist is in
  [.claude/skills/resonance-ui/SKILL.md](.claude/skills/resonance-ui/SKILL.md), and the reference in
  [designs/DESIGN.md](designs/DESIGN.md).
- Colors, spacing and type come from the tokens in `src/styles/tokens.css` (OKLCH), through CSS
  Modules. No Tailwind, no inline design values.
- Every pen stroke uses `INK`, `INK_LIGHT` or `INK_STRONG` from `src/lib/design/strokes.ts`. Shapes
  take a `seed`, so the server and the browser draw the same wobble.
- Icons go into the `Icon` registry, never as inline SVG or emoji.
- Check every UI change in a browser at a desktop width **and** at a 375 px phone width, and app
  changes on a simulator or emulator. A fix to one organic component is checked against its
  siblings: they share one border language.

## Privacy and safety

- Never commit secrets: `.env` and `keys/` stay local.
- An anonymous card never reveals its author to anyone else, in any answer, list, push or page.
- Server code runs on the Admin SDK, which bypasses the rules: re-check blocks, visibility and
  quotas there.
- A new collection that stores a user id is added to `collectAccountData()` in
  `src/lib/account/deletion.ts`, so account deletion removes it.

## Pull request checklist

- [ ] One topic, on its own branch, rebased on `main`
- [ ] A test that fails without the change; lint, typecheck and tests pass
- [ ] Strings in both `en.json` and `zh-TW.json`; `npm run apps:generate` run if needed
- [ ] UI checked at desktop and 375 px (screenshots in the PR help), and on the apps if they changed
- [ ] Rules, API or data changes covered by the emulator suites
- [ ] No secrets, no personal data in fixtures or screenshots

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE),
like the rest of the code.
