import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { readCardForPage } from '@/app/[locale]/(app)/card/[slug]/cardPageData';
import { toCardSeed } from '@/lib/data/cardSeed';

// The card page's server read (the ISR HTML and its RSC payload) against the
// Firestore emulator. It runs on the Admin SDK with no viewer, so it must give
// exactly what firestore.rules' cardVisible gives a signed-out reader — and
// never an anonymous card's author.

const PROJECT = 'demo-resonance-card-page';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'card-page-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const at = (ms: number) => Timestamp.fromMillis(ms);
const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
const card = (id: string, extra: Record<string, unknown> = {}) =>
  set(`cards/${id}`, {
    authorId: 'alice',
    slug: id,
    thoughtCore: `title ${id}`,
    story: `the story of ${id}`,
    tags: ['日常'],
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'public',
    publishedAt: at(1_000_000),
    readCount: 7,
    resonanceCount: 2,
    inviteCount: 0,
    signature: { coreInsight: 'private to the recommender', insightScore: 0.9 },
    ...extra,
  });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await set('users/alice', {
    handle: '愛麗絲',
    handleLower: '愛麗絲',
    bio: 'alice bio',
    region: 'TW',
    initials: 'AL',
    accentColor: 'oklch(90% 0.05 60)',
    avatarSeed: '4242',
    avatarUrl: 'https://img.example/alice.avif',
    verified: true,
    phoneHash: 'alice-phone-hash',
    joinedAt: at(0),
  });
  await Promise.all([
    card('public-walk'),
    card('anon-letter', { anonymous: true }),
    card('private-diary', { visibility: 'private' }),
    card('friends-only', { visibility: 'connections' }),
    card('draft-public', { visibility: 'public', publishedAt: null }),
    // Two cards claiming one slug: the one published first holds it.
    card('first-holder', { slug: 'shared-slug', publishedAt: at(1_000) }),
    card('later-copy', { slug: 'shared-slug', publishedAt: at(2_000), story: 'an impostor' }),
  ]);
});

describe('card page server read', () => {
  it('gives a public card with its byline', async () => {
    const bySlug = await readCardForPage(db, 'public-walk');
    expect(bySlug.id).toBe('public-walk');
    expect(bySlug.card?.story).toBe('the story of public-walk');
    expect(bySlug.author?.handle).toBe('愛麗絲');

    const seed = toCardSeed(bySlug.id, bySlug.card, bySlug.author);
    expect(seed.view?.card.story).toBe('the story of public-walk');
    expect(seed.view?.author).toMatchObject({ id: 'alice', handle: '愛麗絲', avatarUrl: 'https://img.example/alice.avif' });
    // A whitelist: nothing the documents keep for other purposes.
    const payload = JSON.stringify(seed);
    for (const kept of ['alice-phone-hash', 'private to the recommender', 'insightScore', 'readCount']) {
      expect(payload).not.toContain(kept);
    }
  });

  it("never reads or hands over an anonymous card's author", async () => {
    const loaded = await readCardForPage(db, 'anon-letter');
    expect(loaded.card?.story).toBe('the story of anon-letter');
    expect(loaded.author).toBeNull();

    const payload = JSON.stringify(toCardSeed(loaded.id, loaded.card, loaded.author));
    expect(payload).toContain('the story of anon-letter');
    for (const secret of ['alice', '愛麗絲', 'alice bio', 'alice.avif', '4242']) expect(payload).not.toContain(secret);
  });

  it.each(['private-diary', 'friends-only', 'draft-public'])('gives only the id of %s — the browser reads it as the viewer', async (key) => {
    const loaded = await readCardForPage(db, key);
    expect(loaded).toEqual({ id: key, card: null, author: null });
    expect(toCardSeed(loaded.id, loaded.card, loaded.author)).toEqual({ id: key, view: null });
  });

  it('resolves a slug to the card that holds it, like every other resolver', async () => {
    const loaded = await readCardForPage(db, 'shared-slug');
    expect(loaded.id).toBe('first-holder');
    expect(loaded.card?.story).toBe('the story of first-holder');
  });

  it('knows no card for a key that names none', async () => {
    expect(await readCardForPage(db, 'never-was')).toEqual({ id: null, card: null, author: null });
    expect(await readCardForPage(db, 'a/b')).toEqual({ id: null, card: null, author: null });
  });
});
