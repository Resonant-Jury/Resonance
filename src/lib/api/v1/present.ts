import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { Card } from '@/lib/db/types';
import type { AuthorBody, FeedCardBody } from './schemas';

/**
 * Turning Firestore documents into the contract's shapes. Old or hand-edited
 * documents may lack fields; nothing here may throw on one, or a single bad
 * card would fail a whole page (and the clients' strict decoders).
 */

/** StoryCard's excerpt length on the web (lib/adapters/story cardToStory). */
const EXCERPT_CHARS = 96;
/** Characters read per minute, as the web's StoryCard counts (lib/adapters/story). */
const CHARS_PER_MINUTE = 320;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/** A story's prose without Markdown syntax (links keep their text). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first EXCERPT_CHARS characters, cut between code points: slicing UTF-16
 * units can leave half an emoji, a lone surrogate that Swift's JSONDecoder
 * rejects — failing the whole page.
 */
export function excerpt(text: string, max = EXCERPT_CHARS): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

export function readMinutes(story: string): number {
  return Math.max(1, Math.round(story.replace(/\s+/g, '').length / CHARS_PER_MINUTE));
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

export function toFeedCard(c: Card, author: DocumentData | undefined, opts: FeedCardOptions = {}): FeedCardBody {
  const published = c.publishedAt && !Number.isNaN(c.publishedAt.getTime()) ? c.publishedAt : null;
  const anonymous = c.anonymous === true;
  const story = String(c.story ?? '');
  const title = String(c.thoughtCore ?? '');
  return {
    id: c.id,
    slug: str(c.slug),
    title,
    excerpt: excerpt(plainText(story)),
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    publishedAt: published ? published.toISOString() : null,
    author: (!anonymous || opts.deanonymize) && author ? toAuthor(c.authorId, author) : null,
    anonymous,
    visibility: c.visibility === 'private' || c.visibility === 'connections' ? c.visibility : 'public',
    imageUrl: str(c.media?.url),
    imageLabel: str(c.media?.label) ?? (title ? Array.from(title).slice(0, 24).join('') : null),
    accentHue: typeof c.accentHue === 'number' && Number.isFinite(c.accentHue) ? c.accentHue : null,
    readMinutes: readMinutes(story),
    referenceCardId: str(c.referenceCardId),
    reason: opts.reason ?? null,
  };
}

/** Profiles of the given (non-anonymous) authors, by id. */
export async function loadAuthors(db: Firestore, cards: Card[]): Promise<Map<string, DocumentData>> {
  const ids = [...new Set(cards.filter((c) => !c.anonymous).map((c) => c.authorId))];
  const snaps = await Promise.all(ids.map((id) => db.doc(`users/${id}`).get()));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));
}

/** Everyone the viewer blocked: their cards drop out of every list. */
export async function blockedByViewer(db: Firestore, uid: string): Promise<Set<string>> {
  const snap = await db.collection(`users/${uid}/blocks`).get();
  return new Set(snap.docs.map((d) => d.id));
}

export async function connected(db: Firestore, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const pair = a < b ? `${a}_${b}` : `${b}_${a}`;
  return (await db.doc(`connections/${pair}`).get()).exists;
}

/** firestore.rules `cardVisible`, for the Admin SDK (which bypasses rules). */
export async function canView(db: Firestore, card: Card, viewerId: string): Promise<boolean> {
  if (card.visibility === 'public') return true;
  if (card.authorId === viewerId) return true;
  return card.visibility === 'connections' && (await connected(db, viewerId, card.authorId));
}
