import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { publishCard } from '@/lib/api/v1/publish';
import {
  getCardBoxShelves,
  getCardDetail,
  getCardsByKeys,
  getLinksToCard,
  getProfileLinks,
  getRecommendedFeed,
  getRelated,
  getResonances,
} from '@/lib/api/v1/reads';
import { resonateWith, unresonate } from '@/lib/api/v1/resonate';
import { CardBoxTab } from '@/lib/api/v1/schemas';
import { getFeed } from '@/lib/api/v1/service';

// Blocks never apply to anonymous cards. A reader keeps their own block list,
// so any answer about an anonymous card that changed when they blocked
// someone would tell them who wrote it: block a guess, ask, unblock, try the
// next. These are the probes of the connection audit ("anonymous card's
// author can be identified", (a)–(d)) and every other surface that shows an
// anonymous card, each asked with no block, then across one in either
// direction — and answering the same. A named card keeps every block
// behaviour (the last describe). The rules' half — a resonance draft
// answering an anonymous card across a block — is in rules.emulator.test.ts.

const PROJECT = 'demo-resonance-anonymous-blocks';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'anonymous-blocks-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
const card = (id: string, authorId: string, m: number, extra: Record<string, unknown> = {}) =>
  set(`cards/${id}`, {
    authorId,
    thoughtCore: `title ${id}`,
    story: `the story of ${id}`,
    tags: ['雨'],
    visibility: 'public',
    anonymous: false,
    publishedAt: minutesAgo(m),
    resonanceCount: 0,
    ...extra,
  });

// Alice asks; Bob wrote the anonymous cards; Carol is someone else.
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    ...['alice', 'bob', 'carol'].map((id) => set(`users/${id}`, { handle: id, handleLower: id, initials: id[0], accentColor: 'x' })),
    // Bob's anonymous cards — and nothing under his name, so every list below is about them alone.
    card('masked', 'bob', 1, { anonymous: true, slug: 'a-masked-night' }),
    card('masked2', 'bob', 2, { anonymous: true }),
    card('maskedReply', 'bob', 3, { anonymous: true, referenceCardId: 'carolCard' }),
    card('carolCard', 'carol', 10),
    card('host', 'carol', 11, { story: 'Before the rain.\n\n[someone](/card/a-masked-night)\n\n[again](/card/masked2)' }),
    card('aliceCard', 'alice', 12),
    // Alice's own resonance to Bob's anonymous card (her card box's resonated shelf).
    card('aliceAnswer', 'alice', 13, { referenceCardId: 'masked' }),
    // Bob's anonymous card links to Alice's (her linked shelf, her card's links, her profile's).
    set('cardLinks/masked_aliceCard', { sourceCardId: 'masked', targetCardId: 'aliceCard', targetAuthorId: 'alice', createdAt: minutesAgo(1) }),
    set('users/alice/bookmarks/masked', { cardId: 'masked', createdAt: minutesAgo(1) }),
    set('connections/alice_bob', { userIds: ['alice', 'bob'], establishedAt: minutesAgo(60) }),
    set('connections/alice_carol', { userIds: ['alice', 'carol'], establishedAt: minutesAgo(60) }),
  ]);
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

/** The three states a guess can be in, from Alice's side: no block, she blocked Bob, Bob blocked her. */
const STATES = [
  { name: 'no block', apply: async () => {} },
  { name: 'alice blocked bob', apply: () => set('users/alice/blocks/bob', { blockedUid: 'bob', createdAt: minutesAgo(0) }) },
  { name: 'bob blocked alice', apply: () => set('users/bob/blocks/alice', { blockedUid: 'alice', createdAt: minutesAgo(0) }) },
];
const unblock = () => Promise.all([db.doc('users/alice/blocks/bob').delete(), db.doc('users/bob/blocks/alice').delete()]);

/** Ask `probe` in each state; every answer must equal the first (no block). */
async function sameInEveryState<T>(probe: () => Promise<T>): Promise<T> {
  const answers: { name: string; answer: T }[] = [];
  for (const state of STATES) {
    await state.apply();
    answers.push({ name: state.name, answer: await probe() });
    await unblock();
  }
  for (const { name, answer } of answers.slice(1)) expect(answer, name).toEqual(answers[0].answer);
  return answers[0].answer;
}

const ALL = new Set(['resonances', 'related', 'links', 'embeds'] as const);
const ids = (list: { cards: { id: string }[] }) => list.cards.map((c) => c.id);

describe('reads: a block changes no answer about an anonymous card', () => {
  it('(a) the card itself, by slug or id, with everything its page brings along', async () => {
    const detail = await sameInEveryState(() => Promise.all([getCardDetail(db, 'alice', 'masked', ALL), getCardDetail(db, 'alice', 'a-masked-night')]));
    expect(detail[0].card).toMatchObject({ id: 'masked', anonymous: true, author: null });
  });

  it('(a) thirty anonymous cards at once (GET /cards?keys=), and the cards a story embeds', async () => {
    const [keys, host] = await sameInEveryState(() =>
      Promise.all([getCardsByKeys(db, 'alice', ['masked', 'masked2', 'maskedReply', 'carolCard']), getCardDetail(db, 'alice', 'host', ALL)]),
    );
    expect(ids(keys)).toEqual(['masked', 'masked2', 'maskedReply', 'carolCard']);
    expect(ids(host.embeds!)).toEqual(['masked', 'masked2']);
  });

  it('(a) the latest feed and the recommended one', async () => {
    const load = async () => ({
      items: ['masked', 'masked2', 'carolCard'].map((cardId) => ({ cardId, reason: 'r', channel: 'insight' as const, score: 1 })),
    });
    const [feed, recommended] = await sameInEveryState(() => Promise.all([getFeed(db, 'alice', 30), getRecommendedFeed(db, 'alice', load)]));
    expect(ids(feed)).toEqual(['masked', 'masked2', 'maskedReply', 'carolCard', 'host', 'aliceCard', 'aliceAnswer']);
    expect(ids(recommended)).toEqual(['masked', 'masked2', 'carolCard']);
  });

  it("the lists around a card: its resonances, related cards and links — and the profile's links", async () => {
    const [resonances, related, links, profileLinks] = await sameInEveryState(() =>
      Promise.all([
        getResonances(db, 'alice', 'carolCard'),
        getRelated(db, 'alice', 'carolCard'),
        getLinksToCard(db, 'alice', 'aliceCard'),
        getProfileLinks(db, 'alice', 'alice'),
      ]),
    );
    expect(ids(resonances)).toEqual(['maskedReply']);
    expect(ids(related)).toContain('masked');
    expect(ids(links)).toEqual(['masked']);
    expect(ids(profileLinks)).toEqual(['masked']);
  });

  it("the card box's shelves of others' cards, and the thought map's (GET /cards?keys= of the originals answered)", async () => {
    const box = await sameInEveryState(() => getCardBoxShelves(db, 'alice', new Set(CardBoxTab.options)));
    expect(ids(box.resonated!)).toEqual(['masked']);
    expect(ids(box.linked!)).toEqual(['masked']);
    expect(ids(box.bookmarks!)).toEqual(['masked']);
  });
});

describe('writes: a block changes no answer about an anonymous card', () => {
  /** An answer as the client sees it: what the route returns, or the error's code and message. */
  const outcome = (p: Promise<unknown>) =>
    p.then(
      (value) => ({ ok: true as const, value }),
      (e: unknown) => ({ ok: false as const, error: e instanceof ApiFailure ? [e.code, e.message] : String(e) }),
    );

  it('(c) a note from someone without a pen name: refused for that, block or not, writing nothing', async () => {
    await set('users/alice', { initials: 'a' });
    const answer = await sameInEveryState(() => outcome(sendNote(db, 'alice', { cardId: 'masked', text: 'whose is this?' })));
    expect(answer).toEqual({ ok: false, error: ['forbidden', 'Choose a pen name first.'] });
    expect((await db.collection('notes').get()).empty).toBe(true);
  });

  it('(c) a note with a pen name: answered as sent (201 with an id), block or not', async () => {
    // The route answers `{ id }` alone, 201.
    const answer = await sameInEveryState(async () => {
      const sent = await sendNote(db, 'alice', { cardId: 'masked', text: 'whose is this?' });
      return { idShape: /^[A-Za-z0-9]{20}$/.test(sent.id) };
    });
    expect(answer).toEqual({ idShape: true });
    // Delivered only without a block: one bell, to Bob; the two across a block reached no one.
    const notes = (await db.collection('notes').get()).docs.map((d) => d.get('toUserId'));
    expect(notes.sort()).toEqual(['bob', null, null]);
    expect((await db.collection('notifications').get()).docs.map((d) => d.get('userId'))).toEqual(['bob']);
  });

  it("(d) a message quoting one's own note on an anonymous card: one refusal, whoever is asked", async () => {
    const { id: noteId } = await sendNote(db, 'alice', { cardId: 'masked', text: 'whose is this?' });
    for (const to of ['bob', 'carol']) {
      const e = await failure(sendMessage(db, 'alice', { to, text: 'x', noteRef: { cardId: 'masked', noteId }, replyTo: 'nope' }));
      expect([e.code, e.message]).toEqual(['invalid_request', 'That is not a note they left you.']);
    }
    expect((await db.collection('conversations').get()).empty).toBe(true);
  });

  it('resonating with an anonymous card: accepted the same, block or not (and reaching no one across one)', async () => {
    const rang: (string | null)[] = [];
    const answer = await sameInEveryState(async () => {
      await db.recursiveDelete(db.collection('notifications'));
      // The route answers `{ card, changed }`: the bell's id never leaves the server.
      const { notificationId, ...rest } = await resonateWith(db, 'alice', 'masked2', 'aliceCard');
      rang.push(notificationId);
      await unresonate(db, 'alice', 'masked2', 'aliceCard');
      return rest;
    });
    expect(answer).toMatchObject({ changed: true, card: { id: 'aliceCard', referenceCardId: 'masked2' } });
    // The bell rang only where no block stood.
    expect(rang).toEqual(['resonance_alice_masked2', null, null]);
  });

  it('publishing a resonance to an anonymous card: published the same, block or not', async () => {
    let n = 0;
    const answer = await sameInEveryState(async () => {
      const id = `draft${n++}`;
      await card(id, 'alice', 0, { publishedAt: null, referenceCardId: 'masked2' });
      const { id: _id, notificationId: _bell, pendingSlug: _p, ...rest } = await publishCard(db, 'alice', id, async () => `a-reply-${id}`);
      return { ...rest, slug: rest.slug?.replace(id, '') };
    });
    expect(answer).toEqual({ firstPublish: true, slug: 'a-reply-' });
    // Only the publish with no block rang Bob (once: one bell per reader and card).
    expect((await db.collection('notifications').get()).docs.map((d) => d.id)).toEqual(['resonance_alice_masked2']);
  });
});

describe('a named card keeps every block behaviour', () => {
  beforeEach(async () => {
    await card('named', 'bob', 0);
  });

  it('drops out of lists and refuses notes and resonances across a block, either way', async () => {
    const load = async () => ({ items: [{ cardId: 'named', reason: 'r', channel: 'insight' as const, score: 1 }] });
    expect(ids(await getCardsByKeys(db, 'alice', ['named']))).toEqual(['named']);
    for (const state of STATES.slice(1)) {
      await state.apply();
      if (state.name === 'alice blocked bob') {
        // Her own blocks thin her lists.
        expect(ids(await getCardsByKeys(db, 'alice', ['named', 'masked']))).toEqual(['masked']);
        expect(ids(await getFeed(db, 'alice', 30))).not.toContain('named');
        expect(ids(await getRecommendedFeed(db, 'alice', load))).toEqual([]);
      }
      expect((await failure(sendNote(db, 'alice', { cardId: 'named', text: 'hi' }))).code).toBe('blocked');
      expect((await failure(resonateWith(db, 'alice', 'named', 'aliceCard'))).code).toBe('blocked');
      await unblock();
    }
  });
});

// Review: an anonymous card shown to connections only (none is made any more,
// older ones remain) opened for a reader connected to its author and closed
// when they weren't — and blocking ends a connection, so it vanished for
// whoever blocked its author. It is its author's alone now, connected or not.
describe('an older anonymous card for connections only', () => {
  beforeEach(async () => {
    await card('maskedCircle', 'bob', 0, { anonymous: true, visibility: 'connections' });
  });

  it('answers the same whether the reader is connected to its author or not: as if it were private', async () => {
    const probe = async () => [
      (await failure(getCardDetail(db, 'alice', 'maskedCircle'))).code,
      ids(await getCardsByKeys(db, 'alice', ['maskedCircle'])),
      (await failure(sendNote(db, 'alice', { cardId: 'maskedCircle', text: 'hi' }))).code,
      (await failure(resonateWith(db, 'alice', 'maskedCircle', 'aliceCard'))).code,
    ];
    const connected = await probe();
    await db.doc('connections/alice_bob').delete();
    expect(await probe()).toEqual(connected);
    expect(connected).toEqual(['not_found', [], 'not_found', 'not_found']);
    // Its author still reads it.
    expect((await getCardDetail(db, 'bob', 'maskedCircle')).card.id).toBe('maskedCircle');
    expect(await db.collection('notes').get()).toHaveProperty('size', 0);
  });
});
