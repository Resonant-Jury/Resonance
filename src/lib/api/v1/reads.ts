import { Timestamp, type DocumentData, type Firestore, type QueryDocumentSnapshot, type QuerySnapshot } from 'firebase-admin/firestore';
import { cardByKey, slugHolder } from '@/lib/db/firestore/cardKey';
import { uidForHandle } from '@/lib/db/firestore/handles';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { Card, RecommendationItem } from '@/lib/db/types';
import { embeddedCardKeys } from './embeds';
import { ApiFailure } from './http';
import { blockedByViewer, canView, connected, loadAuthors, toAuthor, toFeedCard, visibilityOf, visibleTo } from './present';
import { properlyPublished } from './service';
import {
  CARD_KEYS_MAX,
  type CardBoxTabName,
  type CardDetailBody,
  type CardInclude,
  type CardListBody,
  type FeedCardBody,
  type FeedPageBody,
  type ProfileBody,
  type ProfileInclude,
  type RecommendedFeedBody,
} from './schemas';

/**
 * v1 reads for the apps' reading screens (feed, card page, author page).
 * The web reads the same data through firestore.rules; the Admin SDK skips
 * them, so visibility (`canView`), blocks and anonymity are enforced here
 * and asserted in test/emulator/apiV1Reads.emulator.test.ts.
 *
 * Reads that don't depend on each other run together — the viewer's blocks
 * beside the list they filter — but a key that may be a slug is resolved
 * before its document is read (reading both at once would double the reads
 * of the usual case, a slug that hits).
 */

const RELATED_LIMIT = 3;
const RESONANCE_LIMIT = 30;
const LINK_LIMIT = 30;
/** The web's profile lists (and counts) an author's first 40 public cards. */
const PROFILE_COUNT_LIMIT = 40;

const notFound = () => new ApiFailure('not_found', 'No such card.');

async function cardDoc(db: Firestore, id: string): Promise<Card | null> {
  const snap = await db.doc(`cards/${id}`).get();
  return snap.exists ? mapCard(snap.id, snap.data()!) : null;
}

/** A card the viewer may read, by slug or document id — else not_found (never "forbidden": that would confirm it exists). */
export async function visibleCard(db: Firestore, viewerId: string, key: string): Promise<Card> {
  const snap = await cardByKey(db, key);
  const card = snap ? mapCard(snap.id, snap.data()!) : null;
  if (!card || !(await canView(db, card, viewerId))) throw notFound();
  return card;
}

/**
 * A card the viewer may read, by its document id only — for the routes whose
 * parameter is always an id (a card's lists, notes, a message's card): no
 * slug lookup first.
 */
export async function visibleCardById(db: Firestore, viewerId: string, id: string): Promise<Card> {
  if (!id || id.includes('/')) throw notFound();
  const card = await cardDoc(db, id);
  if (!card || !(await canView(db, card, viewerId))) throw notFound();
  return card;
}

interface PresentOptions {
  reasons?: Map<string, string>;
  /** The viewer's blocks when the caller already read them (beside its own query). */
  blocked?: Set<string>;
}

/**
 * Several lists at once, each as present() would answer it: whether the
 * viewer is connected to each connections-only author, and each author's
 * profile, are read once for all of them.
 */
async function presentAll(db: Firestore, viewerId: string, lists: Card[][], blocked: Set<string>, reasons?: Map<string, string>): Promise<FeedCardBody[][]> {
  const unblocked = lists.map((cards) => cards.filter((c) => !blocked.has(c.authorId)));
  const visible = new Set(await visibleTo(db, viewerId, unblocked.flat()));
  const authors = await loadAuthors(db, [...visible]);
  // An empty reason (a quick first pass has none) is no reason.
  return unblocked.map((cards) =>
    cards.filter((c) => visible.has(c)).map((c) => toFeedCard(c, authors.get(c.authorId), { reason: reasons?.get(c.id) || null })),
  );
}

/** Cards the viewer may read, in the given order, minus blocked authors. */
async function present(db: Firestore, viewerId: string, cards: Card[], opts: PresentOptions = {}): Promise<FeedCardBody[]> {
  const blocked = opts.blocked ?? (await blockedByViewer(db, viewerId));
  return (await presentAll(db, viewerId, [cards], blocked, opts.reasons))[0];
}

const toCards = (snap: QuerySnapshot) => snap.docs.map((d) => mapCard(d.id, d.data()));

async function cardsByIds(db: Firestore, ids: string[]): Promise<Card[]> {
  const unique = [...new Set(ids)].filter((id) => id && !id.includes('/'));
  if (!unique.length) return [];
  const snaps = await db.getAll(...unique.map((id) => db.doc(`cards/${id}`)));
  const byId = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, mapCard(s.id, s.data()!)]));
  return unique.map((id) => byId.get(id)).filter((c): c is Card => !!c);
}

/**
 * cardByKey for many keys (slugs or ids): one query for the slugs, then one
 * batched read for the keys no slug named. In key order, each card once (a
 * card named by both its slug and its id comes back at the first); unknown
 * keys drop out.
 */
async function cardsByKeys(db: Firestore, keys: string[]): Promise<Card[]> {
  const unique = [...new Set(keys)].filter((k) => k && !k.includes('/')).slice(0, CARD_KEYS_MAX);
  if (!unique.length) return [];
  const bySlug = await db.collection('cards').where('slug', 'in', unique).get();
  const sharing = new Map<string, QueryDocumentSnapshot[]>();
  for (const d of bySlug.docs) {
    const slug = String(d.get('slug'));
    sharing.set(slug, [...(sharing.get(slug) ?? []), d]);
  }
  const named = new Map<string, QueryDocumentSnapshot>();
  for (const [slug, docs] of sharing) {
    const holder = slugHolder(docs);
    if (holder) named.set(slug, holder);
  }
  const rest = unique.filter((k) => !named.has(k));
  const byId = rest.length ? await db.getAll(...rest.map((k) => db.doc(`cards/${k}`))) : [];
  const ids = new Map(byId.filter((s) => s.exists).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const key of unique) {
    const snap = named.get(key) ?? ids.get(key);
    if (!snap || seen.has(snap.id)) continue;
    seen.add(snap.id);
    cards.push(mapCard(snap.id, snap.data()!));
  }
  return cards;
}

/**
 * GET /cards?keys= — summaries of the cards named (slugs or ids), in the
 * order asked, for previews: those the viewer may read, minus authors they
 * blocked; anonymous ones without a byline.
 */
export async function getCardsByKeys(db: Firestore, viewerId: string, keys: string[]): Promise<CardListBody> {
  const [cards, blocked] = await Promise.all([cardsByKeys(db, keys), blockedByViewer(db, viewerId)]);
  return { cards: await present(db, viewerId, cards, { blocked }) };
}

/**
 * The reader's recommendations with their reasons, resolved to cards the
 * viewer may read, and whether they are today's (`status`). The recommender
 * answers from what it stored and builds today's after the response
 * (lib/recommend/daily); if it fails the reader still gets the latest feed,
 * so this answers empty rather than 500.
 */
export async function getRecommendedFeed(
  db: Firestore,
  viewerId: string,
  load: (db: Firestore, uid: string) => Promise<{ items: RecommendationItem[]; status?: 'fresh' | 'stale' }>,
): Promise<RecommendedFeedBody> {
  let loaded: { items: RecommendationItem[]; status?: 'fresh' | 'stale' };
  try {
    loaded = await load(db, viewerId);
  } catch (e) {
    console.error('recommendations failed', e);
    return { cards: [], status: 'stale' };
  }
  const reasons = new Map(loaded.items.map((i) => [i.cardId, i.reason]));
  const [cards, blocked] = await Promise.all([
    cardsByIds(db, loaded.items.map((i) => i.cardId)),
    blockedByViewer(db, viewerId),
  ]);
  return {
    cards: await present(db, viewerId, cards.filter((c) => c.publishedAt), { reasons, blocked }),
    status: loaded.status ?? 'fresh',
  };
}

/**
 * A card the viewer may read, with its story — and, as `include` asks, the
 * lists its page shows: exactly what GET /cards/{id}/resonances, /related and
 * /links answer, plus the cards its story embeds. One visibility check and
 * one read of the viewer's blocks serve them all, and the lists' queries run
 * side by side.
 */
export async function getCardDetail(
  db: Firestore,
  viewerId: string,
  key: string,
  include: ReadonlySet<CardInclude> = new Set(),
): Promise<CardDetailBody> {
  const card = await visibleCard(db, viewerId, key);
  const ownerLinks = include.has('links') && card.authorId === viewerId;
  const embedKeys = include.has('embeds') ? embeddedCardKeys(String(card.story ?? '')) : [];
  // Someone else's anonymous card: the reader can't tell whose it is, so the
  // server applies their blocks to it (a card whose author they blocked is
  // not there for them, as in every list).
  const screen = card.anonymous === true && card.authorId !== viewerId;
  const [authorSnap, reference, blocked, resonances, recent, linking, embedded] = await Promise.all([
    card.anonymous ? null : db.doc(`users/${card.authorId}`).get(),
    card.referenceCardId ? cardDoc(db, card.referenceCardId) : null,
    card.referenceCardId || include.size || screen ? blockedByViewer(db, viewerId) : new Set<string>(),
    include.has('resonances') ? resonancesOf(db, card.id).get().then(toCards) : [],
    include.has('related') ? recentPublic(db).get().then(toCards) : [],
    ownerLinks ? cardsLinkingTo(db, card.id) : [],
    embedKeys.length ? cardsByKeys(db, embedKeys) : [],
  ]);
  if (screen && blocked.has(card.authorId)) throw notFound();
  const [referenceCard, resonanceCards, relatedCards, linkCards, embedCards] = await presentAll(
    db,
    viewerId,
    [reference ? [reference] : [], resonances, relatedPool(card, recent), linking, embedded],
    blocked,
  );
  return {
    card: toFeedCard(card, authorSnap?.exists ? authorSnap.data() : undefined),
    story: String(card.story ?? ''),
    visibility: visibilityOf(card.visibility),
    anonymous: card.anonymous === true,
    resonanceCount: Number(card.resonanceCount ?? 0),
    coreInsight: card.signature?.coreInsight || null,
    isOwner: card.authorId === viewerId,
    referenceCard: referenceCard[0] ?? null,
    ...(include.has('resonances') ? { resonances: { cards: resonanceCards } } : {}),
    ...(include.has('related') ? { related: { cards: relatedCards.slice(0, RELATED_LIMIT) } } : {}),
    ...(include.has('links') ? { links: { cards: linkCards } } : {}),
    ...(include.has('embeds') ? { embeds: { cards: embedCards } } : {}),
  };
}

const resonancesOf = (db: Firestore, id: string) =>
  db
    .collection('cards')
    .where('referenceCardId', '==', id)
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .limit(RESONANCE_LIMIT);

const recentPublic = (db: Firestore) =>
  db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .limit(RELATED_LIMIT + 6);

/** Recent cards other than `base`, those sharing the most of its tags first. */
function relatedPool(base: Card, recent: Card[]): Card[] {
  const tags = (base.tags ?? []).slice(0, 5);
  const overlap = (c: Card) => (c.tags ?? []).filter((t) => tags.includes(t)).length;
  return recent.filter((c) => c.id !== base.id).sort((a, b) => overlap(b) - overlap(a));
}

/** The cards whose card links point at this one, newest link first. */
async function cardsLinkingTo(db: Firestore, cardId: string): Promise<Card[]> {
  const links = await db.collection('cardLinks').where('targetCardId', '==', cardId).orderBy('createdAt', 'desc').limit(LINK_LIMIT).get();
  return cardsByIds(db, links.docs.map((d) => String(d.get('sourceCardId') ?? '')).filter(Boolean));
}

/** Public cards written in response to this one, newest first. */
export async function getResonances(db: Firestore, viewerId: string, id: string): Promise<CardListBody> {
  const [, snap, blocked] = await Promise.all([visibleCardById(db, viewerId, id), resonancesOf(db, id).get(), blockedByViewer(db, viewerId)]);
  return { cards: await present(db, viewerId, toCards(snap), { blocked }) };
}

/** A few recent public cards, those sharing the most tags first (the web's getRelatedCards). */
export async function getRelated(db: Firestore, viewerId: string, id: string): Promise<CardListBody> {
  const [base, snap, blocked] = await Promise.all([visibleCardById(db, viewerId, id), recentPublic(db).get(), blockedByViewer(db, viewerId)]);
  return { cards: (await present(db, viewerId, relatedPool(base, toCards(snap)), { blocked })).slice(0, RELATED_LIMIT) };
}

/** Cards that link to this one — shown to its author only, as on the web. */
export async function getLinksToCard(db: Firestore, viewerId: string, id: string): Promise<CardListBody> {
  const card = await visibleCardById(db, viewerId, id);
  if (card.authorId !== viewerId) return { cards: [] };
  const [cards, blocked] = await Promise.all([cardsLinkingTo(db, card.id), blockedByViewer(db, viewerId)]);
  return { cards: await present(db, viewerId, cards, { blocked }) };
}

/** The person who goes by a pen name: through its reservation (lib/db/firestore/handles). */
async function userByHandle(db: Firestore, handle: string) {
  const uid = await uidForHandle(db, handle);
  const snap = uid ? await db.doc(`users/${uid}`).get() : null;
  if (!snap?.exists) throw new ApiFailure('not_found', 'No such person.');
  return snap as QueryDocumentSnapshot;
}

/** GET /users/{handle}/cards' page size when none is asked for (FeedQuery's default). */
const DEFAULT_PAGE = 12;
const EMPTY_PAGE: FeedPageBody = { cards: [], nextCursor: null };

/**
 * A person's profile as the viewer sees it — and, as `include` asks, exactly
 * what GET /users/{handle}/cards (its first page, of `limit` cards) and
 * /links answer. The first page comes out of the query that counts their
 * cards, and one read of the viewer's blocks serves the profile and its links.
 */
export async function getProfile(
  db: Firestore,
  viewerId: string,
  handle: string,
  opts: { include?: ReadonlySet<ProfileInclude>; limit?: number } = {},
): Promise<ProfileBody> {
  const include = opts.include ?? new Set();
  // The count's query holds the page, so a page is never longer than it.
  const limit = Math.min(opts.limit ?? DEFAULT_PAGE, PROFILE_COUNT_LIMIT);
  const user = await userByHandle(db, handle);
  const isSelf = user.id === viewerId;
  const [blocks, isConnected, published, linking] = await Promise.all([
    // The whole block list when the links need it (it answers isBlocked too), else the one document.
    include.has('links')
      ? blockedByViewer(db, viewerId)
      : isSelf
        ? null
        : db.doc(`users/${viewerId}/blocks/${user.id}`).get().then((s) => (s.exists ? new Set([user.id]) : null)),
    isSelf ? Promise.resolve(false) : connected(db, viewerId, user.id),
    db.collection('cards').where('authorId', '==', user.id).where('visibility', '==', 'public').orderBy('publishedAt', 'desc').limit(PROFILE_COUNT_LIMIT).get(),
    include.has('links') ? cardsLinkingToAuthor(db, user.id, viewerId) : [],
  ]);
  const blocked = !isSelf && !!blocks?.has(user.id);
  const cardCount = published.docs.filter((d) => d.get('publishedAt') && d.get('anonymous') !== true).length;
  const u = user.data();
  const joined = u.joinedAt instanceof Timestamp ? u.joinedAt.toDate() : new Date(0);
  return {
    author: toAuthor(user.id, u),
    bio: typeof u.bio === 'string' && u.bio ? u.bio : null,
    joinedAt: joined.toISOString(),
    cardCount: blocked ? 0 : cardCount,
    isSelf,
    isConnected,
    isBlocked: blocked,
    ...(include.has('cards') ? { cards: blocked ? EMPTY_PAGE : profilePage(published.docs.slice(0, limit), u, limit) } : {}),
    ...(include.has('links') ? { links: { cards: await present(db, viewerId, linking, { blocked: blocks ?? new Set() }) } } : {}),
  };
}

/** A page of a profile's cards from its query's documents (`limit` asked): public, attributed, properly published. */
function profilePage(docs: QueryDocumentSnapshot[], author: DocumentData, limit: number): FeedPageBody {
  const cards = docs
    .filter((d) => properlyPublished(d.get('publishedAt')))
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => !c.anonymous);
  const last = docs.at(-1)?.get('publishedAt');
  return {
    cards: cards.map((c) => toFeedCard(c, author)),
    nextCursor: docs.length === limit && last instanceof Timestamp ? last.toDate().toISOString() : null,
  };
}

/**
 * The author's public cards, newest first. Anonymous cards never appear on a
 * profile (ux §6); nothing is listed for someone the viewer blocked.
 */
export async function getProfileCards(db: Firestore, viewerId: string, handle: string, limit: number, cursor?: string): Promise<FeedPageBody> {
  const user = await userByHandle(db, handle);
  let q = db
    .collection('cards')
    .where('authorId', '==', user.id)
    .where('visibility', '==', 'public')
    .orderBy('publishedAt', 'desc')
    .limit(limit);
  if (cursor) q = q.startAfter(Timestamp.fromDate(new Date(cursor)));
  const [blocked, snap] = await Promise.all([
    user.id === viewerId ? false : db.doc(`users/${viewerId}/blocks/${user.id}`).get().then((s) => s.exists),
    q.get(),
  ]);
  if (blocked) return EMPTY_PAGE;
  return profilePage(snap.docs, user.data(), limit);
}

/**
 * Cards by others linking to this author's cards, newest link first. To
 * anyone but the author, only links into their attributed cards count: a
 * link into one of their anonymous cards would tie that card to them (and a
 * link whose card isn't theirs at all names them wrongly).
 */
async function cardsLinkingToAuthor(db: Firestore, userId: string, viewerId: string): Promise<Card[]> {
  const links = await db.collection('cardLinks').where('targetAuthorId', '==', userId).orderBy('createdAt', 'desc').limit(LINK_LIMIT).get();
  let pairs = links.docs
    .map((d) => ({ source: String(d.get('sourceCardId') ?? ''), target: String(d.get('targetCardId') ?? '') }))
    .filter((p) => p.source);
  if (viewerId !== userId) {
    const targets = await cardsByIds(db, pairs.map((p) => p.target));
    const named = new Set(targets.filter((c) => c.authorId === userId && c.anonymous !== true).map((c) => c.id));
    pairs = pairs.filter((p) => named.has(p.target));
  }
  return cardsByIds(db, pairs.map((p) => p.source));
}

/** Cards by others that link to this author's cards (the profile's "linked" tab). */
export async function getProfileLinks(db: Firestore, viewerId: string, handle: string): Promise<CardListBody> {
  const user = await userByHandle(db, handle);
  const [cards, blocked] = await Promise.all([cardsLinkingToAuthor(db, user.id, viewerId), blockedByViewer(db, viewerId)]);
  return { cards: await present(db, viewerId, cards, { blocked }) };
}

const BOX_LIMIT = 40;
/** How many drafts are read to find the most recently edited ones. */
const DRAFT_SCAN = 200;

/**
 * One shelf of the viewer's card box (the web's useMyCardBox): their own
 * published, private and draft cards; the originals they wrote a resonance
 * for; cards linking to theirs; their bookmarks. Their own cards keep their
 * byline even when published anonymously (marked `anonymous`).
 */
export async function getCardBox(db: Firestore, viewerId: string, tab: CardBoxTabName): Promise<{ cards: FeedCardBody[] }> {
  if (tab === 'published' || tab === 'private' || tab === 'draft') {
    // One query per shelf: with a shared "newest 40" query, an author's 41st
    // published card pushed every draft (publishedAt null sorts last) out of
    // the box, and private cards crowded out public ones.
    const own = db.collection('cards').where('authorId', '==', viewerId);
    const [snap, me] = await Promise.all([
      tab === 'draft'
        ? own.where('publishedAt', '==', null).limit(DRAFT_SCAN).get()
        : own.where('visibility', 'in', tab === 'private' ? ['private'] : ['public', 'connections'])
            .orderBy('publishedAt', 'desc').limit(BOX_LIMIT).get(),
      db.doc(`users/${viewerId}`).get(),
    ]);
    const edited = (d: QueryDocumentSnapshot) => {
      const at = d.get('updatedAt');
      return at instanceof Timestamp ? at.toMillis() : 0;
    };
    const docs = tab === 'draft'
      // Most recently edited first (sorted here: drafts are few, and this needs no composite index).
      ? [...snap.docs].sort((a, b) => edited(b) - edited(a)).slice(0, BOX_LIMIT)
      : snap.docs;
    const mine = docs.map((d) => mapCard(d.id, d.data())).filter((c) => tab === 'draft' || c.publishedAt);
    return { cards: mine.map((c) => toFeedCard(c, me.data(), { deanonymize: true })) };
  }
  const blockedP = blockedByViewer(db, viewerId);
  // Settled up front, so a failure of the list's own query leaves no unhandled rejection behind.
  blockedP.catch(() => {});
  let ids: string[];
  if (tab === 'resonated') {
    const snap = await db.collection('cards').where('authorId', '==', viewerId).select('referenceCardId').limit(60).get();
    ids = snap.docs.map((d) => d.get('referenceCardId')).filter((id): id is string => typeof id === 'string' && id.length > 0);
  } else if (tab === 'linked') {
    const links = await db.collection('cardLinks').where('targetAuthorId', '==', viewerId).orderBy('createdAt', 'desc').limit(LINK_LIMIT).get();
    ids = links.docs.map((d) => String(d.get('sourceCardId') ?? '')).filter(Boolean);
  } else {
    // A bookmarked card that has since gone private simply drops out.
    const marks = await db.collection(`users/${viewerId}/bookmarks`).orderBy('createdAt', 'desc').limit(BOX_LIMIT * 2).get();
    ids = marks.docs.map((d) => d.id);
  }
  const [cards, blocked] = await Promise.all([cardsByIds(db, ids), blockedP]);
  return { cards: await present(db, viewerId, cards, { blocked }) };
}
