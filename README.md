<p align="center">
  <img src="public/icon.svg" width="88" height="88" alt="Resonance">
</p>

<h1 align="center">Resonance</h1>

<p align="center">
  <strong>Answer stories with stories.</strong><br>
  A place to share life stories as cards, where a reply isn't a like but a story of your own.
</p>

<p align="center">
  <a href="https://apps.apple.com/tw/app/resonance/id6817604797"><img src="public/badges/appstore-en-us.svg" height="40" align="middle" alt="Download on the App Store"></a>
  &nbsp;
  <a href="https://play.google.com/store/apps/details?id=com.resonance.stories"><img src="public/badges/googleplay-en.png" height="60" align="middle" alt="Get it on Google Play"></a>
</p>

<p align="center">
  <a href="https://resonance.channel">resonance.channel</a> ·
  <a href="README.zh-TW.md">中文說明</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="LICENSE">MIT License</a>
</p>

---

## What is Resonance?

Resonance (共振, *gòngzhèn*) is a social writing platform built around **story cards**. You write a
piece of your life on a card: a title, a story, perhaps a photo. When someone else's card moves you,
you don't tap a heart. You **resonate** with it, by writing a card of your own that answers it. The
two cards are linked from then on, and so are the two of you.

It runs on the web at [resonance.channel](https://resonance.channel) and as native apps for iPhone
and Android, in Traditional Chinese and English. Anyone can read public cards without an account.

## Why does it exist?

Most social apps measure attention: likes, views, time spent. What gets measured gets optimized,
and the result is performance. Resonance is built on the opposite bet. It rewards only the
response that costs something, which is writing.

- **Resonance, not likes.** The one public way to answer a card is to write another card. There are
  no like counts and no public comment threads, so nobody performs for an audience under someone
  else's story.
- **Three ways to respond, each to someone.** Bookmark a card (for yourself: private, never
  counted). Leave its author a **note** (for them alone: a letter nobody else reads). Or resonate
  (for everyone: a card of your own).
- **Messages are earned through a story.** There is no open inbox. Two people become connected
  when one resonates publicly with the other's card, or when an author answers a note, and only
  connections can message each other. Every conversation starts from a story, never from "hi". It
  is deliberately not a dating app.
- **Anonymity per card.** The account is real, but any single card can go out anonymously: no name,
  not on your profile. The server never tells anyone else who wrote it. The most vulnerable stories
  are often the ones most worth writing.
- **AI as a mirror, not a judge.** Before you publish, Resonance shows you the core insight it read
  in your draft. Recommendations come with the reason they were picked for you, and they are built
  from what you *write*, never from what you click or how long you looked. No score is ever shown.
- **A safe room.** Every card, person and message can be reported, and anyone can be blocked. No
  ads, no tracking. You can download everything you wrote, or delete your account.

The full reasoning, in Chinese, is in
[docs/product-design-principles.md](docs/product-design-principles.md).

## Who is it for?

- **Writers of real life**: people who want to put a turning point, a small realization or a quiet
  memory into words, and be answered in kind.
- **Readers who'd rather reply than react**: people for whom a story is worth more than a number.
- **Contributors**: Resonance is open source. It is a working example of one product on three
  platforms (a Next.js site and SwiftUI and Jetpack Compose apps) over one versioned API, with a
  hand-drawn interface generated at runtime. If that interests you, read on.

## Download

<a href="https://apps.apple.com/tw/app/resonance/id6817604797"><img src="public/badges/appstore-en-us.svg" height="40" align="middle" alt="Download on the App Store"></a>
&nbsp;
<a href="https://play.google.com/store/apps/details?id=com.resonance.stories"><img src="public/badges/googleplay-en.png" height="60" align="middle" alt="Get it on Google Play"></a>

- **iPhone**: [App Store](https://apps.apple.com/tw/app/resonance/id6817604797)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=com.resonance.stories)
- **Web**: [resonance.channel](https://resonance.channel). On a phone,
  [resonance.channel/download](https://resonance.channel/download) opens the right store.

## Features

| | |
| --- | --- |
| **Write cards** | A warm paper editor for a title, a story (headings, quotes, pictures, links, other cards) and a cover photo, or a doodle illustration drawn from your story. Each card is for everyone, for your connections, or for you alone. Drafts save themselves. |
| **Resonate** | Answer a card with a card. A card's page shows the cards that answer it. |
| **Notes** | A private letter to a card's author. It connects you only if they write back. |
| **Connections and messages** | One-to-one conversations between people who met through a story, with replies, shared cards and link previews. |
| **Thought map** | Lay your own cards out on dotted paper: group them into regions, draw arrows and label how they relate. |
| **Feeds** | The latest public cards, and picks for you with the reason each was chosen. |
| **Notifications** | A bell on the web, and push notifications in the apps. |
| **Safety and your data** | Anonymous cards, blocking, reporting, data export, account deletion with a grace period. |

## How it's built

```
Web (Next.js + React)      iOS app (SwiftUI)      Android app (Compose)
          │                        │                        │
          └──────────── /api/v1 (Zod → OpenAPI) ────────────┘
                                   │
    Firebase Auth · Cloud Firestore · Cloudflare R2 · OpenAI · FCM
```

- **Web**: Next.js 15 (App Router), React 19, TypeScript (strict), next-intl, CSS Modules with OKLCH
  design tokens (no Tailwind), a Tiptap 3 editor that stores Markdown, SWR. Deployed on Vercel.
- **Data**: Cloud Firestore. The browser reads through security rules (`firebase/firestore.rules`);
  anything that reaches another person (publishing, notes, messages, pen names) goes through the
  server, which uses the Admin SDK and re-checks what the rules guarantee.
- **API**: `/api/v1` is a contract. Zod schemas in `src/lib/api/v1/schemas.ts` generate
  `openapi/v1/openapi.json`, from which the iOS and Android clients are generated. It only changes
  additively.
- **Apps**: SwiftUI (`apps/ios`, XcodeGen) and Jetpack Compose (`apps/android`). They take their
  design tokens, strings, icons and story editor from the web (`npm run apps:generate`), so the web
  stays the single source.
- **Images**: Cloudflare R2, re-encoded on the server with sharp.
- **AI** (OpenAI, server-side only): English URL slugs, tag suggestions, story illustrations, the
  pre-publish insight, and recommendations (vector search over each card's insight, then a rerank
  that writes the reason).
- **Design**: hand-drawn shapes generated from seeds (`src/lib/design`), so the server and the
  browser draw the same wobble. See [designs/DESIGN.md](designs/DESIGN.md).

| Where | What |
| --- | --- |
| `src/app` | pages (`[locale]/…`) and API routes (`api/…`) |
| `src/components` | `atoms`, `molecules`, `sections` |
| `src/lib` | auth, data layer, API contract, AI, push, storage, design geometry |
| `src/messages` | UI strings, `en.json` and `zh-TW.json` (the apps read them too) |
| `firebase/` | Firestore rules and indexes |
| `apps/` | the iOS and Android apps ([apps/README.md](apps/README.md)) |
| `test/` | shared test setup; tests live next to their code |
| `docs/` | product principles, policies, store listings, [architecture in Chinese](docs/ARCHITECTURE.zh-TW.md) |

[CLAUDE.md](CLAUDE.md) is the detailed, current architecture guide (written for AI coding agents
and humans alike).

## Getting started

You need Node.js 22 and npm. To run against local Firebase emulators (recommended; nothing touches
real data) you also need Java 21 and the [Firebase CLI](https://firebase.google.com/docs/cli)
(`npm install -g firebase-tools`).

```bash
git clone https://github.com/Resonant-Jury/Resonance.git
cd Resonance
npm ci

npm run emulators                  # terminal 1: Auth + Firestore emulators (project demo-resonance)
npx tsx scripts/seed-emulator.ts   # terminal 2: a small known world (alice, bob, carol, dora)
npm run dev:emulator               # http://localhost:3000, wired to the emulators
```

To sign in as a seeded account, open the browser console on the site and run
`await window.__emulatorSignIn('alice@resonance.test', password)`. The password is `SEED_PASSWORD` in
`scripts/seed-emulator.ts`; the helper exists only in emulator builds.

`dev:emulator` needs no secrets: it points Firebase at the emulators and leaves image storage off.
Features that call OpenAI need `OPENAI_API_KEY` in a `.env` file (copy `.env.example`).

### Checks

```bash
npm run lint
npm run typecheck
npm test                # Vitest: unit and component tests
npm run test:emulator   # Firestore rules and server suites against the emulators
```

### The apps

Run the site for them on port 3100 (`npm run dev:emulator -- --port 3100`), then:

- **iOS** (Xcode and XcodeGen): `cd apps/ios && xcodegen generate`, build the `Resonance` scheme,
  and launch it with `-emulator YES`.
- **Android** (JDK 21 and the Android SDK): `cd apps/android && ./gradlew :app:assembleDebug`, and
  start it with `--ez emulator true`.

[apps/README.md](apps/README.md) has the full commands, launch arguments and tests.

## Contributing

Bug reports, fixes and ideas are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. In
short: work on a branch, add a test that fails without your change, keep every string in both
languages, build UI from the design system's primitives, and check it at desktop and phone widths.

Before proposing a feature, read the product principles above. Resonance will not add like counts,
public comment threads or open messaging, however small.

## Security

Please don't open a public issue for a vulnerability. Email **support@resonance.channel** instead;
[SECURITY.md](SECURITY.md) explains what to include and what happens next.

## License

The source code is released under the [MIT License](LICENSE), Copyright (c) 2026 Resonant-Jury.

The license covers the code. It does not cover the **Resonance name, the wave logo or the app
icons**: please don't use them for your own product, and give a fork you publish its own name and
icon. Fonts, flags and the store badges in this repository come from others under their own terms;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Apple, the Apple logo and App Store are trademarks of Apple Inc. Google Play and the Google Play logo
are trademarks of Google LLC.
