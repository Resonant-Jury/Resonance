import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { updateCard } from '@/lib/api/v1/cards';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { publishCard } from '@/lib/api/v1/publish';
import {
  getCardBox,
  getCardDetail,
  getCardsByKeys,
  getProfile,
  getProfileCards,
  getRecommendedFeed,
  getRelated,
  getResonances,
} from '@/lib/api/v1/reads';
import { getFeed } from '@/lib/api/v1/service';
import { storedSummary, summarize } from '@/lib/api/v1/summary';
import { backfillCardSummaries } from '@/lib/api/v1/summaryBackfill';

// Lists read their cards without the story: publishing (and every server
// write that leaves a story on a card) stores the excerpt and read time a list
// shows, and a list uses them while they still describe the story — else it
// reads that card's story, as for a card published before they existed.

const PROJECT = 'demo-resonance-summaries';
let app: App;
let db: Firestore;
const slugBase = async () => 'a-quiet-night';
const noVectors = { setVisibility: async () => {} };

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-summaries-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const STORY = `## A walk\n\nThe **rain** stopped and [the street](https://example.com) shone. ${'走'.repeat(700)}`;

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all(
    ['alice', 'bob'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x' })),
  );
});

const data = async (id: string) => (await db.doc(`cards/${id}`).get()).data()!;

describe('the stored summary', () => {
  it('is written when a card is published, stamped with the same server time as updatedAt', async () => {
    await db.doc('cards/c1').set({ authorId: 'alice', thoughtCore: '安靜的夜晚', story: STORY, visibility: 'public', publishedAt: null });
    await publishCard(db, 'alice', 'c1', slugBase);
    const d = await data('c1');
    expect(d).toMatchObject({ ...summarize(STORY), slug: 'a-quiet-night' });
    expect(d.readMinutes).toBe(2);
    expect((d.excerptAt as Timestamp).isEqual(d.updatedAt as Timestamp)).toBe(true);
    // Naming the card after it (the slug) leaves the summary current.
    expect(storedSummary(d)).toEqual(summarize(STORY));
  });

  it('follows the story an applied edit brings, and is restated when only the settings change', async () => {
    await db.doc('cards/c1').set({ authorId: 'alice', thoughtCore: 't', story: STORY, visibility: 'public', publishedAt: minutesAgo(5) });
    await db.doc('cards/c1/edits/current').set({ thoughtCore: 't', story: 'A *new* ending.', tags: [], visibility: 'public' });
    await applyCardEdit(db, 'alice', 'c1');
    expect(storedSummary(await data('c1'))).toEqual({ excerpt: 'A new ending.', readMinutes: 1 });

    await updateCard(db, 'alice', 'c1', { visibility: 'private' }, noVectors);
    const d = await data('c1');
    expect(storedSummary(d)).toEqual({ excerpt: 'A new ending.', readMinutes: 1 });
    expect((d.excerptAt as Timestamp).isEqual(d.updatedAt as Timestamp)).toBe(true);
  });

  it('stops counting once the story is written by something that does not restate it (the web editor applies edits itself)', async () => {
    await db.doc('cards/c1').set({ authorId: 'alice', thoughtCore: 't', story: STORY, visibility: 'public', publishedAt: null });
    await publishCard(db, 'alice', 'c1', slugBase);
    await db.doc('cards/c1').set({ story: 'Rewritten in the browser.', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    expect(storedSummary(await data('c1'))).toBeNull();
  });
});

describe('lists', () => {
  // A summary that differs from what the story would give shows which one a
  // list drew: stored means the story was never needed.
  const STORED = { excerpt: 'STORED SUMMARY', readMinutes: 9 };
  const card = (id: string, authorId: string, m: number, extra: Record<string, unknown> = {}) =>
    db.doc(`cards/${id}`).set({
      authorId,
      thoughtCore: `title ${id}`,
      story: `The story of ${id}.`,
      tags: ['雨'],
      visibility: 'public',
      publishedAt: minutesAgo(m),
      updatedAt: minutesAgo(m),
      ...STORED,
      excerptAt: minutesAgo(m),
      ...extra,
    });

  beforeEach(async () => {
    await Promise.all([
      card('mine', 'alice', 1),
      card('mine-private', 'alice', 2, { visibility: 'private' }),
      card('reply', 'bob', 3, { referenceCardId: 'mine' }),
      card('linker', 'bob', 4),
      card('marked', 'bob', 5, { slug: 'marked-card' }),
      db.doc('cardLinks/l1').set({ sourceCardId: 'linker', targetCardId: 'mine', targetAuthorId: 'alice', createdAt: minutesAgo(1) }),
      db.doc('users/alice/bookmarks/marked').set({ createdAt: minutesAgo(1) }),
      db.doc('users/alice/bookmarks/linker').set({ createdAt: minutesAgo(2) }),
    ]);
  });

  /** Every v1 list as alice sees it, by card id. */
  async function everyList() {
    const recommended = async () => ({
      items: ['reply', 'linker'].map((cardId) => ({ cardId, channel: 'insight' as const, reason: 'r', score: 1 })),
      status: 'fresh' as const,
    });
    const lists = await Promise.all([
      getFeed(db, 'alice', 10),
      getProfileCards(db, 'alice', 'bob', 10),
      getProfile(db, 'alice', 'bob', { include: new Set(['cards'] as const) }).then((p) => p.cards!),
      getCardBox(db, 'alice', 'published'),
      getCardBox(db, 'alice', 'private'),
      getCardBox(db, 'alice', 'linked'),
      getCardBox(db, 'alice', 'bookmarks'),
      getResonances(db, 'alice', 'mine'),
      getRelated(db, 'alice', 'mine'),
      getCardsByKeys(db, 'alice', ['marked-card', 'reply']),
      getRecommendedFeed(db, 'alice', recommended),
      getCardDetail(db, 'alice', 'mine', new Set(['resonances', 'related', 'links'])).then((d) => ({
        cards: [...d.resonances!.cards, ...d.related!.cards, ...d.links!.cards],
      })),
    ]);
    return lists.flatMap((l) => l.cards);
  }

  it('show the stored summary — every one of them, without the story', async () => {
    const cards = await everyList();
    expect(cards.length).toBeGreaterThan(15);
    for (const c of cards) expect({ id: c.id, excerpt: c.excerpt, readMinutes: c.readMinutes }).toEqual({ id: c.id, ...STORED });
  });

  it("read the story of a card whose summary is missing or behind its story, and only that card's", async () => {
    await db.doc('cards/linker').update({ story: 'Edited in the browser.', updatedAt: FieldValue.serverTimestamp() });
    await db.doc('cards/marked').update({ excerpt: FieldValue.delete(), readMinutes: FieldValue.delete(), excerptAt: FieldValue.delete() });
    const cards = await everyList();
    for (const c of cards) {
      const expected =
        c.id === 'linker' ? { excerpt: 'Edited in the browser.', readMinutes: 1 }
          : c.id === 'marked' ? { excerpt: 'The story of marked.', readMinutes: 1 }
            : STORED;
      expect({ id: c.id, excerpt: c.excerpt, readMinutes: c.readMinutes }).toEqual({ id: c.id, ...expected });
    }
    expect(cards.map((c) => c.id)).toEqual(expect.arrayContaining(['linker', 'marked']));
  });

  it('give drafts their excerpt from the story (a draft has no summary until it is published)', async () => {
    await db.doc('cards/draft').set({ authorId: 'alice', thoughtCore: 'd', story: 'Half a thought.', visibility: 'public', publishedAt: null });
    const [draft] = (await getCardBox(db, 'alice', 'draft')).cards;
    expect(draft).toMatchObject({ id: 'draft', excerpt: 'Half a thought.', readMinutes: 1 });
  });

  it('come from the stored summary again once the backfill has caught a card up', async () => {
    await db.doc('cards/linker').update({ story: 'Edited in the browser.', updatedAt: FieldValue.serverTimestamp() });
    await backfillCardSummaries(db, { write: true });
    expect(storedSummary(await data('linker'))).toEqual({ excerpt: 'Edited in the browser.', readMinutes: 1 });
  });

  it('agree with the card page, which reads the story itself', async () => {
    await db.doc('cards/c2').set({ authorId: 'bob', thoughtCore: 't', story: STORY, visibility: 'public', publishedAt: null });
    await publishCard(db, 'bob', 'c2', slugBase);
    const listed = (await getFeed(db, 'alice', 10)).cards.find((c) => c.id === 'c2');
    expect(listed).toEqual((await getCardDetail(db, 'alice', 'c2')).card);
  });
});

describe('backfillCardSummaries (scripts/backfill-card-summaries.ts)', () => {
  const at = minutesAgo(30);

  beforeEach(async () => {
    await Promise.all([
      // Published before summaries were stored.
      ...Array.from({ length: 7 }, (_, i) =>
        db.doc(`cards/old${i}`).set({ authorId: 'bob', thoughtCore: 't', story: `Old story ${i}.`, visibility: 'public', publishedAt: at, updatedAt: at }),
      ),
      // Rewritten in the browser after publishing stored one.
      db.doc('cards/edited').set({
        authorId: 'bob', thoughtCore: 't', story: 'The new text.', visibility: 'public', publishedAt: at,
        excerpt: 'The old text.', readMinutes: 1, excerptAt: minutesAgo(20), updatedAt: minutesAgo(10),
      }),
      // Current: left alone.
      db.doc('cards/current').set({
        authorId: 'bob', thoughtCore: 't', story: 'Kept.', visibility: 'public', publishedAt: at,
        excerpt: 'Kept.', readMinutes: 1, excerptAt: at, updatedAt: at,
      }),
      db.doc('cards/draft').set({ authorId: 'bob', thoughtCore: 't', story: 'Not yet.', visibility: 'public', publishedAt: null }),
    ]);
  });

  it('changes nothing on a dry run, and says what is due', async () => {
    const report = await backfillCardSummaries(db, { pageSize: 4 });
    expect(report).toMatchObject({ scanned: 10, published: 9, current: 1, due: 8, written: 0, changed: 0, failed: 0 });
    expect(report.sample).toEqual(expect.arrayContaining(['edited', 'old0']));
    expect((await data('old0')).excerpt).toBeUndefined();
    expect((await data('edited')).excerpt).toBe('The old text.');
  });

  it('writes the due summaries — current from then on — and finds nothing left on a second run', async () => {
    const report = await backfillCardSummaries(db, { write: true, pageSize: 4 });
    expect(report).toMatchObject({ due: 8, written: 8, changed: 0, failed: 0 });
    expect(storedSummary(await data('old3'))).toEqual({ excerpt: 'Old story 3.', readMinutes: 1 });
    expect(storedSummary(await data('edited'))).toEqual({ excerpt: 'The new text.', readMinutes: 1 });
    // The card's own dates are untouched; drafts get nothing.
    expect(((await data('old3')).updatedAt as Timestamp).isEqual(at)).toBe(true);
    expect((await data('draft')).excerpt).toBeUndefined();
    expect(await backfillCardSummaries(db, { write: true })).toMatchObject({ published: 9, current: 9, due: 0, written: 0 });
  });

  it('restates every published card with `all`', async () => {
    expect(await backfillCardSummaries(db, { write: true, all: true })).toMatchObject({ due: 9, written: 9 });
  });
});
