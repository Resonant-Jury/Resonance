import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { Card } from '@/lib/db/types';
import { linkPreviewsOf } from '@/lib/links/previewShape';
import type { AuthorBody, FeedCardBody, LinkPreviewBody } from './schemas';
import { summaryOf, type ListCard } from './summary';

/**
 * Turning Firestore documents into the contract's shapes. Old or hand-edited
 * documents may lack fields; nothing here may throw on one, or a single bad
 * card would fail a whole page (and the clients' strict decoders).
 */

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

type Visibility = FeedCardBody['visibility'];

/**
 * A card's visibility as the contract names it. A response enum never carries
 * a value the clients don't know (see ./schemas), so a stored value outside
 * the three — or none — reads as what firestore.rules make of it: a card only
 * its author can open, i.e. private.
 */
export function visibilityOf(v: unknown): Visibility {
  return v === 'public' || v === 'connections' || v === 'private' ? v : 'private';
}

/**
 * A card's stored link previews as the contract carries them: only the ones a
 * reader may draw (an http(s) link with a title, a picture from our own
 * link-image route only — lib/links/previewShape), absent fields as null.
 */
export function presentLinkPreviews(stored: unknown): LinkPreviewBody[] {
  return linkPreviewsOf(stored).map((p) => ({
    url: p.url,
    title: p.title,
    description: p.description ?? null,
    siteName: p.siteName ?? null,
    image: p.image ?? null,
  }));
}

export function toAuthor(id: string, u: DocumentData): AuthorBody {
  return {
    id,
    handle: String(u.handle ?? ''),
    initials: String(u.initials ?? ''),
    accentColor: String(u.accentColor ?? ''),
    avatarUrl: str(u.avatarUrl),
    avatarSeed: u.avatarSeed == null ? null : String(u.avatarSeed),
    verified: u.verified === true,
    region: str(u.region),
  };
}

export interface FeedCardOptions {
  reason?: string | null;
  /** The viewer wrote the card (their card box): show the byline even when anonymous. */
  deanonymize?: boolean;
}

/**
 * A card as the contract shows it in a list. A card read for a list without
 * its story (LIST_FIELDS) must have been through withStories() first: its
 * excerpt and read time come from the stored summary or the story read then.
 */
export function toFeedCard(c: ListCard, author: DocumentData | undefined, opts: FeedCardOptions = {}): FeedCardBody {
  const published = c.publishedAt && !Number.isNaN(c.publishedAt.getTime()) ? c.publishedAt : null;
  const anonymous = c.anonymous === true;
  const summary = summaryOf(c);
  const title = String(c.thoughtCore ?? '');
  return {
    id: c.id,
    slug: str(c.slug),
    title,
    excerpt: summary.excerpt,
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    publishedAt: published ? published.toISOString() : null,
    author: (!anonymous || opts.deanonymize) && author ? toAuthor(c.authorId, author) : null,
    anonymous,
    visibility: visibilityOf(c.visibility),
    imageUrl: str(c.media?.url),
    imageLabel: str(c.media?.label) ?? (title ? Array.from(title).slice(0, 24).join('') : null),
    accentHue: typeof c.accentHue === 'number' && Number.isFinite(c.accentHue) ? c.accentHue : null,
    readMinutes: summary.readMinutes,
    referenceCardId: str(c.referenceCardId),
    reason: opts.reason ?? null,
  };
}

/** A document id that can safely be put in a path (hand-edited data could hold anything). */
const docIdOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');

/** Profiles of the given (non-anonymous) authors, by id — one batched read. */
export async function loadAuthors(db: Firestore, cards: Card[]): Promise<Map<string, DocumentData>> {
  const ids = [...new Set(cards.filter((c) => !c.anonymous).map((c) => c.authorId))].filter(docIdOk);
  if (!ids.length) return new Map();
  const snaps = await db.getAll(...ids.map((id) => db.doc(`users/${id}`)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));
}

/** Everyone the viewer blocked: their named cards drop out of every list (blockHides). */
export async function blockedByViewer(db: Firestore, uid: string): Promise<Set<string>> {
  const snap = await db.collection(`users/${uid}/blocks`).get();
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Whether the viewer's blocks (`blocked`, blockedByViewer) keep a card from
 * them: one under the name of someone they blocked. Never an anonymous card —
 * the viewer writes their own block list, so a card that vanished when they
 * blocked someone would tell them who wrote it. A block hides people and
 * their named cards; an anonymous card is there for everyone who may read it.
 */
export function blockHides(card: Pick<Card, 'authorId' | 'anonymous'>, blocked: ReadonlySet<string>): boolean {
  return card.anonymous !== true && blocked.has(card.authorId);
}

export async function connected(db: Firestore, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const pair = a < b ? `${a}_${b}` : `${b}_${a}`;
  return (await db.doc(`connections/${pair}`).get()).exists;
}

/**
 * firestore.rules `cardOpen` once the viewer's connection to the author is
 * known — `isConnected` is only asked for a published, named connections
 * card. A transaction that read the connection itself asks this (canView
 * reads it). An anonymous card for connections only (none is made any more:
 * an anonymous card is public or private) is its author's alone: whether a
 * reader could open it would turn on being connected to its author.
 */
export function cardVisible(card: Card, viewerId: string, isConnected: (authorId: string) => boolean): boolean {
  if (card.authorId === viewerId) return true;
  // A draft is its author's alone, whatever visibility it will be published with.
  if (!card.publishedAt) return false;
  if (card.visibility === 'public') return true;
  return card.visibility === 'connections' && card.anonymous !== true && isConnected(card.authorId);
}

const needsConnection = (card: Card, viewerId: string) =>
  card.authorId !== viewerId && !!card.publishedAt && card.visibility === 'connections' && card.anonymous !== true;

/** firestore.rules `cardVisible`, for the Admin SDK (which bypasses rules). */
export async function canView(db: Firestore, card: Card, viewerId: string): Promise<boolean> {
  const isConnected = needsConnection(card, viewerId) && (await connected(db, viewerId, card.authorId));
  return cardVisible(card, viewerId, () => isConnected);
}

/**
 * The cards the viewer may read, in order (canView for a list): whether the
 * viewer is connected to each connections-only author is read once per
 * author, in one batch.
 */
export async function visibleTo(db: Firestore, viewerId: string, cards: Card[]): Promise<Card[]> {
  const authors = [...new Set(cards.filter((c) => needsConnection(c, viewerId)).map((c) => c.authorId))].filter(docIdOk);
  const linked = new Set<string>();
  if (authors.length) {
    const byPair = new Map(authors.map((a) => [viewerId < a ? `${viewerId}_${a}` : `${a}_${viewerId}`, a]));
    const snaps = await db.getAll(...[...byPair.keys()].map((pair) => db.doc(`connections/${pair}`)));
    for (const s of snaps) if (s.exists) linked.add(byPair.get(s.id)!);
  }
  return cards.filter((c) => cardVisible(c, viewerId, (a) => linked.has(a)));
}
