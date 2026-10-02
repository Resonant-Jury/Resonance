/**
 * The store screenshot world: a curated, believable demo in the LOCAL Firebase
 * emulators, for the App Store / Play screenshots
 * (`npm run emulators`, then `npx tsx scripts/seed-store-demo.ts`):
 *
 *   npx tsx scripts/seed-store-demo.ts             # the zh-TW world (default)
 *   npx tsx scripts/seed-store-demo.ts --lang=en   # the English world
 *
 * It first CLEARS both emulators (Auth and Firestore, project demo-resonance),
 * so it replaces whatever the test world (or the other language) held;
 * `npx tsx scripts/seed-emulator.ts` restores the test world. Nothing here can
 * reach production: the project id is a `demo-` one and every request goes to
 * 127.0.0.1.
 *
 * The viewer signs in as demo@resonance.test (the same local test password as
 * seed-emulator.ts); she is 小滿 in the zh-TW world and Mia in the English one.
 * Around her: six writers, a dozen of their cards, response cards (a resonance
 * is a card that points at another with referenceCardId), two connections and
 * one conversation, her thought map, a draft and a few bell rows. The two
 * worlds tell the same moments in their own language (scripts/store-demo/
 * zh-TW.ts and en.ts) with the same card ids and relationships, so one capture
 * plan fits both. A card carries an illustration when
 * docs/store/graphics/demo-media/<cardId>.jpg exists (made by
 * store-demo-illustrations.ts; the same file serves both languages); it goes
 * in as a data: URI, which both native apps' image loaders accept, so no image
 * server is needed. Without the file the card has no media and the apps draw
 * their striped placeholder.
 *
 * The data is exported and main() runs only when this file is executed
 * directly, so other scripts can read the card list without seeding anything.
 * The unsuffixed exports (VIEWER, WRITERS, CARDS, DRAFT) are the zh-TW world.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';
import { en } from './store-demo/en';
import { checkWorld, type CardSpec, type DemoLang, type DemoWorld, type Writer } from './store-demo/shared';
import { zhTW } from './store-demo/zh-TW';

export type { CardSpec, DemoLang, DemoWorld, Writer };

/** The seed accounts' local password, read from seed-emulator.ts (importing that script would run it). */
function seedPassword(): string {
  const src = readFileSync(resolve(process.cwd(), 'scripts/seed-emulator.ts'), 'utf8');
  const found = src.match(/^export const SEED_PASSWORD = '(.*)';/m);
  if (!found) throw new Error('SEED_PASSWORD not found in scripts/seed-emulator.ts');
  return found[1];
}

export const DEMO_EMAIL = 'demo@resonance.test';

/** The worlds, by language. */
export const WORLDS: Record<DemoLang, DemoWorld> = { 'zh-TW': zhTW, en };

export function worldFor(lang: string): DemoWorld {
  if (lang !== 'zh-TW' && lang !== 'en') throw new Error(`Unknown --lang=${lang} (use zh-TW or en)`);
  return WORLDS[lang];
}

/** `--lang=en` or `--lang en`; zh-TW when absent. */
export function langFromArgs(args: string[]): string {
  const at = args.findIndex((a) => a === '--lang' || a.startsWith('--lang='));
  if (at < 0) return 'zh-TW';
  return args[at].includes('=') ? args[at].slice('--lang='.length) : (args[at + 1] ?? '');
}

// The zh-TW world, under the names other scripts already import.
export const DEMO_HANDLE = zhTW.viewer.handle;
export const VIEWER: Writer = zhTW.viewer;
export const WRITERS: Writer[] = zhTW.writers;
export const CARDS: CardSpec[] = zhTW.cards;
export const DRAFT = zhTW.draft;

/** Where the generated illustrations live: one <cardId>.jpg per card (see store-demo-illustrations.ts). */
export const DEMO_MEDIA_DIR = 'docs/store/graphics/demo-media';

/** A card doc may not pass 1 MiB in Firestore; stay well under it (the base64 is a third larger than the file). */
const MAX_IMAGE_BYTES = 600_000;

/**
 * The card's illustration as a data: URI, or null when it has none. A file over
 * the budget is re-encoded smaller with sips (macOS) rather than failing the seed.
 */
export function demoMediaDataUri(cardId: string): string | null {
  const file = resolve(process.cwd(), DEMO_MEDIA_DIR, `${cardId}.jpg`);
  if (!existsSync(file)) return null;
  let bytes = readFileSync(file);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    const dir = mkdtempSync(join(tmpdir(), 'demo-media-'));
    try {
      for (const [width, quality] of [[640, 75], [512, 70], [384, 65]] as const) {
        const out = join(dir, `${cardId}.jpg`);
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), '--resampleWidth', String(width), file, '--out', out], { stdio: 'ignore' });
        bytes = readFileSync(out);
        if (bytes.byteLength <= MAX_IMAGE_BYTES) break;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`${cardId}.jpg is still ${bytes.byteLength} bytes after shrinking`);
  }
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

const now = Date.now();

async function clearEmulators() {
  const targets = [
    `http://127.0.0.1:8080/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`,
  ];
  for (const url of targets) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Clearing ${url} failed: ${res.status}`);
  }
}

async function main() {
  const lang = langFromArgs(process.argv.slice(2));
  const world = worldFor(lang);
  checkWorld(world);
  const { viewer, writers, cards, draft } = world;
  const people = [viewer, ...writers];
  const handleOf = new Map(people.map((p) => [p.uid, p.handle]));

  Object.assign(process.env, emulatorEnv);
  const password = seedPassword();
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

  await clearEmulators();

  const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'store-demo');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const at = (minutesAgo: number) => Timestamp.fromMillis(now - minutesAgo * 60_000);

  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  const put = (path: string, data: Record<string, unknown>) => writes.push({ path, data });

  // ---- people ----
  for (const u of people) {
    const isViewer = u.uid === viewer.uid;
    await auth.createUser({
      uid: u.uid,
      email: isViewer ? DEMO_EMAIL : `${u.uid}@resonance.test`,
      password,
      emailVerified: true,
    });
    put(`users/${u.uid}`, {
      handle: u.handle,
      handleLower: u.handle.toLowerCase(),
      bio: u.bio,
      region: u.region,
      primaryLocale: world.lang,
      autoTranslateTo: world.autoTranslateTo,
      // No account is verified (there is no verification yet), so the demo shows no ✓ either.
      verified: false,
      phoneHash: '',
      avatarSeed: String([...u.uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)),
      initials: u.handle.slice(0, 2).toUpperCase(),
      accentColor: u.accent,
      joinedAt: at(60 * 24 * u.joinedDaysAgo),
      handleChangedAt: at(60 * 24 * u.joinedDaysAgo),
      // The just-in-time hints stay out of the screenshots (lib/hints.ts: three displays and they are gone).
      ...(isViewer ? { hintsSeen: { 'anonymous-publish': 3, 'note-privacy': 3, 'feed-reason': 3 } } : {}),
    });
    // The pen name's reservation, as the profile writes keep it (lib/db/firestore/handles).
    put(`handles/${u.handle.toLowerCase()}`, { uid: u.uid, handle: u.handle });
  }

  // ---- cards (a resonance is a card whose referenceCardId names another) ----
  const resonanceCounts = new Map<string, number>();
  for (const c of cards) if (c.ref) resonanceCounts.set(c.ref, (resonanceCounts.get(c.ref) ?? 0) + 1);
  let illustrated = 0;
  for (const c of cards) {
    const image = demoMediaDataUri(c.id);
    if (image) illustrated++;
    put(`cards/${c.id}`, {
      authorId: c.author,
      slug: c.id,
      thoughtCore: c.title,
      story: c.paragraphs.join('\n\n'),
      tags: c.tags,
      originalLocale: world.lang,
      translations: {},
      visibility: 'public',
      publishedAt: at(c.ago),
      updatedAt: at(c.ago),
      readCount: c.reads,
      resonanceCount: resonanceCounts.get(c.id) ?? 0,
      inviteCount: 0,
      accentHue: c.hue,
      anonymous: false,
      ...(c.ref ? { referenceCardId: c.ref } : {}),
      ...(image ? { media: { type: 'image', url: image, label: c.title } } : {}),
    });
  }

  // The viewer's draft: a title and two paragraphs, not yet published.
  put(`cards/${draft.id}`, {
    authorId: viewer.uid,
    thoughtCore: draft.title,
    story: draft.story.join('\n\n'),
    tags: [],
    originalLocale: world.lang,
    translations: {},
    visibility: 'public',
    publishedAt: null,
    updatedAt: at(draft.ago),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    anonymous: false,
  });

  // A card of one writer's that links to one of the viewer's (the bell's card_link, and the "linked" shelf of her card box).
  const author = (cardId: string) => cards.find((c) => c.id === cardId)!.author;
  const link = world.cardLink;
  put(`cardLinks/${link.source}_${link.target}`, {
    sourceCardId: link.source,
    sourceAuthorId: author(link.source),
    targetCardId: link.target,
    targetAuthorId: author(link.target),
    createdAt: at(link.ago),
  });

  // ---- connections: whoever resonated with whom is connected (connectResonance in lib/api/v1/publish.ts) ----
  const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);
  const connectedAt = new Map<string, number>();
  for (const c of cards) {
    if (!c.ref) continue;
    const [a, b] = pair(c.author, author(c.ref));
    const id = `${a}_${b}`;
    connectedAt.set(id, Math.max(connectedAt.get(id) ?? 0, c.ago));
  }
  for (const [id, ago] of connectedAt) {
    put(`connections/${id}`, { userIds: id.split('_'), establishedAt: at(ago) });
  }

  // ---- the conversation with the partner writer, begun on one of her cards ----
  const partner = world.partner;
  const [first, second] = pair(partner, viewer.uid);
  const CONVO = `${first}_${second}`;
  const messages = world.messages;
  const last = messages[messages.length - 1];
  const firstAgo = Math.max(...messages.map((m) => m.ago));
  const viewerLastAgo = Math.min(...messages.filter((m) => m.from === viewer.uid).map((m) => m.ago));
  put(`conversations/${CONVO}`, {
    participants: [first, second],
    createdAt: at(firstAgo),
    updatedAt: at(last.ago),
    lastMessage: { text: last.text, senderId: last.from, sentAt: at(last.ago) },
    // Unread for the viewer: what the partner wrote since the viewer last spoke.
    unread: { [partner]: 0, [viewer.uid]: messages.filter((m) => m.from === partner && m.ago < viewerLastAgo).length },
    originCardId: world.originCardId,
  });
  messages.forEach((m, i) => {
    put(`conversations/${CONVO}/messages/m${i + 1}`, {
      senderId: m.from,
      text: m.text,
      sentAt: at(m.ago),
      ...(m.cardRef ? { cardRef: m.cardRef } : {}),
    });
  });

  // ---- the bell ----
  for (const n of world.notifications) {
    put(`notifications/${n.id}`, {
      userId: viewer.uid,
      type: n.type,
      payload: { fromUserId: n.from, fromHandle: handleOf.get(n.from), ...n.extra },
      readAt: n.read ? at(n.ago - 30) : null,
      createdAt: at(n.ago),
    });
  }

  // ---- her thought map ----
  const map = `thoughtMaps/${viewer.uid}`;
  for (const z of world.map.zones) {
    put(`${map}/groups/${z.id}`, { title: z.title, hue: z.hue, x: z.x, y: z.y, w: z.w, h: z.h, createdAt: at(60) });
  }
  for (const n of world.map.nodes) {
    put(`${map}/nodes/${n.cardId}`, { cardId: n.cardId, x: n.x, y: n.y, groupId: n.zone, createdAt: at(60), updatedAt: at(60) });
  }
  for (const e of world.map.edges) {
    put(`${map}/edges/${e.source}_${e.target}`, { sourceCardId: e.source, targetCardId: e.target, label: e.label, createdAt: at(60) });
  }

  // ---- write it all ----
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) batch.set(db.doc(w.path), w.data);
    await batch.commit();
  }

  console.log(
    `Store demo (${world.lang}) seeded into ${EMULATOR_PROJECT_ID}: ${people.length} people, ${cards.length} published cards ` +
      `(${cards.filter((c) => c.ref).length} resonances, ${illustrated} illustrated), 1 draft, ${connectedAt.size} connections, 1 conversation.`,
  );
  console.log(`Viewer: ${DEMO_EMAIL} / pen name ${viewer.handle}. Draft: /write/${draft.id}`);
  const handle = handleOf.get(partner)!;
  console.log(`Thread with ${handle}: /messages/${encodeURIComponent(handle)}`);
}

// Seed only when run directly (tsx scripts/seed-store-demo.ts), not when another script imports the data.
if (process.argv[1] && /seed-store-demo\.[cm]?[tj]s$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
