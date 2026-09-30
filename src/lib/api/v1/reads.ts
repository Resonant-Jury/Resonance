import { Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { cardByKey } from '@/lib/db/firestore/cardKey';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { Card, RecommendationItem } from '@/lib/db/types';
import { ApiFailure } from './http';
import { blockedByViewer, canView, connected, loadAuthors, toAuthor, toFeedCard } from './present';
import { properlyPublished } from './service';
import type { CardBoxTabName, CardDetailBody, FeedCardBody, FeedPageBody, ProfileBody } from './schemas';

/**
 * v1 reads for the apps' reading screens (feed, card page, author page).
 * The web reads the same data through firestore.rules; the Admin SDK skips
 * them, so visibility (`canView`), blocks and anonymity are enforced here
 * and asserted in test/emulator/apiV1Reads.emulator.test.ts.
 */

const RELATED_LIMIT = 3;
const RESONANCE_LIMIT = 30;
const LINK_LIMIT = 30;
/** The web's profile lists (and counts) an author's first 40 public cards. */
const PROFILE_COUNT_LIMIT = 40;

async function cardDoc(db: Firestore, id: string): Promise<Card | null> {
  const snap = await db.doc(`cards/${id}`).get();
  return snap.exists ? mapCard(snap.id, snap.data()!) : null;
}

/** A card the viewer may read, by slug or document id — else not_found (never "forbidden": that would confirm it exists). */
export async function visibleCard(db: Firestore, viewerId: string, key: string): Promise<Card> {
  const snap = await cardByKey(db, key);
  const card = snap ? mapCard(snap.id, snap.data()!) : null;
  if (!card || !(await canView(db, card, viewerId))) throw new ApiFailure('not_found', 'No such card.');
  return card;
}

/** Cards the viewer may read, in the given order, minus blocked authors. */
async function present(db: Firestore, viewerId: string, cards: Card[], reasons?: Map<string, string>): Promise<FeedCardBody[]> {
  const blocked = await blockedByViewer(db, viewerId);
  const visible: Card[] = [];
  for (const c of cards) {
    if (blocked.has(c.authorId)) continue;
    if (await canView(db, c, viewerId)) visible.push(c);
  }
  const authors = await loadAuthors(db, visible);
  return visible.map((c) => toFeedCard(c, authors.get(c.authorId), { reason: reasons?.get(c.id) ?? null }));
}

async function cardsByIds(db: Firestore, ids: string[]): Promise<Card[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const snaps = await db.getAll(...unique.map((id) => db.doc(`cards/${id}`)));
  const byId = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, mapCard(s.id, s.data()!)]));
  return unique.map((id) => byId.get(id)).filter((c): c is Card => !!c);
}

/**
 * Today's recommendations with their reasons, resolved to cards the viewer may
 * read. The funnel (LLM) runs at most once a day per reader; if it fails the
 * reader still gets the latest feed, so this answers empty rather than 500.
 */
export async function getRecommendedFeed(
  db: Firestore,
  viewerId: string,
  load: (db: Firestore, uid: string) => Promise<{ items: RecommendationItem[] }>,
): Promise<{ cards: FeedCardBody[] }> {
  let items: RecommendationItem[] = [];
  try {
    items = (await load(db, viewerId)).items;
  } catch (e) {
    console.error('recommendations failed', e);
    return { cards: [] };
  }
  const reasons = new Map(items.map((i) => [i.cardId, i.reason]));
  const cards = (await cardsByIds(db, items.map((i) => i.cardId))).filter((c) => c.publishedAt);
  return { cards: await present(db, viewerId, cards, reasons) };
}

export async function getCardDetail(db: Firestore, viewerId: string, key: string): Promise<CardDetailBody> {
  const card = await visibleCard(db, viewerId, key);
  const [authorSnap, reference] = await Promise.all([
    card.anonymous ? null : db.doc(`users/${card.authorId}`).get(),
    card.referenceCardId ? cardDoc(db, card.referenceCardId) : null,
  ]);
  const referenceCard = reference && (await present(db, viewerId, [reference]))[0];
  return {
    card: toFeedCard(card, authorSnap?.exists ? authorSnap.data() : undefined),
    story: String(card.story ?? ''),
    visibility: card.visibility,
    anonymous: card.anonymous === true,
    resonanceCount: Number(card.resonanceCount ?? 0),
    coreInsight: card.signature?.coreInsight || null,
    isOwner: card.authorId === viewerId,
    referenceCard: referenceCard ?? null,
  };
}

/** Public cards written in response to this one, newest first. */
export async function getResonances(db: Firestore, viewerId: string, id: string): Promise<{ cards: FeedCardBody[] }> {
  await visibleCard(db, viewerId, id);
  const snap = await db
    .collection('cards')
    .where('referenceCardId', '==', id)
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .limit(RESONANCE_LIMIT)
    .get();
  return { cards: await present(db, viewerId, snap.docs.map((d) => mapCard(d.id, d.data()))) };
}

/** A few recent public cards, those sharing the most tags first (the web's getRelatedCards). */
export async function getRelated(db: Firestore, viewerId: string, id: string): Promise<{ cards: FeedCardBody[] }> {
  const base = await visibleCard(db, viewerId, id);
  const tags = (base.tags ?? []).slice(0, 5);
  const snap = await db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .limit(RELATED_LIMIT + 6)
    .get();
  const overlap = (c: Card) => (c.tags ?? []).filter((t) => tags.includes(t)).length;
  const pool = snap.docs
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => c.id !== base.id)
    .sort((a, b) => overlap(b) - overlap(a));
  return { cards: (await present(db, viewerId, pool)).slice(0, RELATED_LIMIT) };
}

/** Cards that link to this one — shown to its author only, as on the web. */
export async function getLinksToCard(db: Firestore, viewerId: string, id: string): Promise<{ cards: FeedCardBody[] }> {
  const card = await visibleCard(db, viewerId, id);
  if (card.authorId !== viewerId) return { cards: [] };
  const links = await db.collection('cardLinks').where('targetCardId', '==', card.id).orderBy('createdAt', 'desc').limit(LINK_LIMIT).get();
  const cards = await cardsByIds(db, links.docs.map((d) => String(d.get('sourceCardId') ?? '')).filter(Boolean));
  return { cards: await present(db, viewerId, cards) };
}

async function userByHandle(db: Firestore, handle: string) {
  const snap = await db.collection('users').where('handleLower', '==', handle.toLowerCase()).limit(1).get();
  if (snap.empty) throw new ApiFailure('not_found', 'No such person.');
  return snap.docs[0];
}

export async function getProfile(db: Firestore, viewerId: string, handle: string): Promise<ProfileBody> {
  const user = await userByHandle(db, handle);
  const isSelf = user.id === viewerId;
  const [blocked, isConnected, published] = await Promise.all([
    isSelf ? Promise.resolve(false) : db.doc(`users/${viewerId}/blocks/${user.id}`).get().then((s) => s.exists),
    isSelf ? Promise.resolve(false) : connected(db, viewerId, user.id),
    db.collection('cards').where('authorId', '==', user.id).where('visibility', '==', 'public').orderBy('publishedAt', 'desc').limit(PROFILE_COUNT_LIMIT).get(),
  ]);
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
  };
}

/**
 * The author's public cards, newest first. Anonymous cards never appear on a
 * profile (ux §6); nothing is listed for someone the viewer blocked.
 */
export async function getProfileCards(db: Firestore, viewerId: string, handle: string, limit: number, cursor?: string): Promise<FeedPageBody> {
  const user = await userByHandle(db, handle);
  if (user.id !== viewerId && (await db.doc(`users/${viewerId}/blocks/${user.id}`).get()).exists) {
    return { cards: [], nextCursor: null };
  }
  let q = db
    .collection('cards')
    .where('authorId', '==', user.id)
    .where('visibility', '==', 'public')
    .orderBy('publishedAt', 'desc')
    .limit(limit);
  if (cursor) q = q.startAfter(Timestamp.fromDate(new Date(cursor)));
  const snap = await q.get();
  const cards = snap.docs
    .filter((d) => properlyPublished(d.get('publishedAt')))
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => !c.anonymous);
  const last = snap.docs.at(-1)?.get('publishedAt');
  return {
    cards: cards.map((c) => toFeedCard(c, user.data())),
    nextCursor: snap.size === limit && last instanceof Timestamp ? last.toDate().toISOString() : null,
  };
}

/** Cards by others that link to this author's cards (the profile's "linked" tab). */
export async function getProfileLinks(db: Firestore, viewerId: string, handle: string): Promise<{ cards: FeedCardBody[] }> {
  const user = await userByHandle(db, handle);
  const links = await db.collection('cardLinks').where('targetAuthorId', '==', user.id).orderBy('createdAt', 'desc').limit(LINK_LIMIT).get();
  const cards = await cardsByIds(db, links.docs.map((d) => String(d.get('sourceCardId') ?? '')).filter(Boolean));
  return { cards: await present(db, viewerId, cards) };
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
  if (tab === 'resonated') {
    const snap = await db.collection('cards').where('authorId', '==', viewerId).limit(60).get();
    const refIds = snap.docs.map((d) => d.get('referenceCardId')).filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { cards: await present(db, viewerId, await cardsByIds(db, refIds)) };
  }
  if (tab === 'linked') {
    const links = await db.collection('cardLinks').where('targetAuthorId', '==', viewerId).orderBy('createdAt', 'desc').limit(LINK_LIMIT).get();
    return { cards: await present(db, viewerId, await cardsByIds(db, links.docs.map((d) => String(d.get('sourceCardId') ?? '')).filter(Boolean))) };
  }
  // A bookmarked card that has since gone private simply drops out.
  const marks = await db.collection(`users/${viewerId}/bookmarks`).orderBy('createdAt', 'desc').limit(BOX_LIMIT * 2).get();
  return { cards: await present(db, viewerId, await cardsByIds(db, marks.docs.map((d) => d.id))) };
}
