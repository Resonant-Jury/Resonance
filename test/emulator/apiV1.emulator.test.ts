import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { cancelAccountDeletion, scheduleAccountDeletion } from '@/lib/account/deletion';
import { ApiFailure } from '@/lib/api/v1/http';
import { Me } from '@/lib/api/v1/schemas';
import { getFeed, getMe } from '@/lib/api/v1/service';

// The v1 API's business logic against the real Firestore emulator. The web
// client gets these guarantees from firestore.rules; the API runs on the
// Admin SDK (which bypasses rules), so each guarantee is asserted here.

const PROJECT = 'demo-resonance-api';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
  const user = (id: string) => set(`users/${id}`, { handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 60)' });
  await Promise.all(['alice', 'bob', 'carol', 'dana'].map(user));
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const card = (id: string, authorId: string, m: number, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId,
    thoughtCore: `title ${id}`,
    story: 'x'.repeat(200),
    tags: ['日常'],
    visibility: 'public',
    publishedAt: minutesAgo(m),
    ...extra,
  });

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('getMe', () => {
  it('returns the profile, with absent optional fields as null', async () => {
    expect(await getMe(db, 'alice')).toEqual({
      id: 'alice',
      handle: 'alice',
      initials: 'AL',
      accentColor: 'oklch(90% 0.05 60)',
      bio: null,
      avatarUrl: null,
      region: null,
      primaryLocale: null,
      handleChangedAt: null,
      deletion: null,
    });
  });

  // The apps showed the undo banner from a second request on every start.
  it('carries a scheduled deletion, so the apps need no second request', async () => {
    const at = new Date('2026-10-01T08:00:00.000Z');
    await scheduleAccountDeletion(db, 'alice', at);
    const me = await getMe(db, 'alice');
    expect(me.deletion).toEqual({ requestedAt: '2026-10-01T08:00:00.000Z', purgeAfter: '2026-10-08T08:00:00.000Z' });
    expect(Me.safeParse(me).success).toBe(true);
    expect((await getMe(db, 'bob')).deletion).toBeNull();
    await cancelAccountDeletion(db, 'alice');
    expect((await getMe(db, 'alice')).deletion).toBeNull();
  });

  it('is not_found for an account without a profile', async () => {
    expect((await failure(getMe(db, 'nobody'))).code).toBe('not_found');
  });
});

describe('getFeed', () => {
  it('serves a page around a malformed card, and cuts excerpts between code points', async () => {
    await Promise.all([
      card('ok', 'bob', 1, { story: `${'字'.repeat(95)}🌧️ after the rain` }),
      // An old document without story, tags or title must not fail the page.
      db.doc('cards/old').set({ authorId: 'dana', visibility: 'public', publishedAt: minutesAgo(2) }),
    ]);
    const page = await getFeed(db, 'alice', 10);
    expect(page.cards.map((c) => c.id)).toEqual(['ok', 'old']);
    expect(page.cards[1]).toMatchObject({ title: '', excerpt: '', tags: [] });
    const cut = page.cards[0].excerpt;
    expect(cut).toBe(`${'字'.repeat(95)}🌧…`);
    // No lone surrogates: every code unit pairs up.
    expect(cut).toBe(Buffer.from(cut, 'utf8').toString('utf8'));
  });

  it('pages newest-first, hides blocked and anonymous authors, and never ends early on a blocked page', async () => {
    await Promise.all([
      card('c1', 'bob', 1),
      card('c2', 'carol', 2), // blocked by alice
      card('c3', 'carol', 3), // blocked by alice
      card('c4', 'dana', 4, { anonymous: true }),
      card('c5', 'bob', 5, { visibility: 'connections' }), // not public
      card('c6', 'dana', 6),
      db.doc('cards/draft').set({ authorId: 'bob', thoughtCore: 'd', story: 's', tags: [], visibility: 'public', publishedAt: null }),
      db.doc('users/alice/blocks/carol').set({ blockedUid: 'carol', createdAt: minutesAgo(10) }),
    ]);

    const first = await getFeed(db, 'alice', 2);
    // The raw page was [c1, c2]; c2 is dropped but the cursor still moves past it.
    expect(first.cards.map((c) => c.id)).toEqual(['c1']);
    expect(first.nextCursor).not.toBeNull();
    expect(first.cards[0]).toMatchObject({ title: 'title c1', author: { handle: 'bob', initials: 'BO' } });
    expect(first.cards[0].excerpt).toHaveLength(97); // 96 chars + ellipsis, as the web's StoryCard

    const second = await getFeed(db, 'alice', 2, first.nextCursor!);
    expect(second.cards.map((c) => c.id)).toEqual(['c4']);
    expect(second.cards[0].author).toBeNull();

    const third = await getFeed(db, 'alice', 2, second.nextCursor!);
    expect(third.cards.map((c) => c.id)).toEqual(['c6']);
    expect(third.nextCursor).toBeNull();
  });
});
