import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { Card } from '@/lib/db/types';

/**
 * A card's list summary — the plain-text excerpt and read time every list
 * draws — kept on the card document, so lists read their cards without their
 * stories (LIST_FIELDS): a page of 12 cards no longer downloads 12 stories.
 *
 * The server stores it whenever it writes a story it knows: publishing,
 * applying an edit (edits/apply), changing a card's settings, and the
 * backfill (scripts/backfill-card-summaries.ts). `excerptAt` is that write's
 * server time — the same as the `updatedAt` it writes beside it. A later
 * write to the card that doesn't refresh the summary (the web editor still
 * applies an edit from the browser) moves `updatedAt` past `excerptAt`; the
 * stored summary is then ignored and the list reads that card's story
 * instead (withStories), as it does for a card that has none yet.
 */

/** StoryCard's excerpt length on the web (lib/adapters/story cardToStory). */
const EXCERPT_CHARS = 96;
/** Characters read per minute, as the web's StoryCard counts (lib/adapters/story). */
const CHARS_PER_MINUTE = 320;

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

export interface StorySummary {
  excerpt: string;
  readMinutes: number;
}

/** What a list shows of a story (a missing or malformed story reads as empty). */
export function summarize(story: unknown): StorySummary {
  const s = typeof story === 'string' ? story : '';
  return { excerpt: excerpt(plainText(s)), readMinutes: readMinutes(s) };
}

/**
 * The summary fields a server write stores beside the story it leaves on the
 * card — in the same write as its `updatedAt: serverTimestamp()`, so the two
 * stamps are equal.
 */
export function summaryFields(story: unknown): StorySummary & { excerptAt: FieldValue } {
  return { ...summarize(story), excerptAt: FieldValue.serverTimestamp() };
}

/**
 * Everything a list needs of a card: the FeedCard's fields, what visibility,
 * blocks and a shared slug are decided on, the drafts' order — and the stored
 * summary in place of the story.
 */
export const LIST_FIELDS = [
  'authorId',
  'thoughtCore',
  'tags',
  'publishedAt',
  'updatedAt',
  'anonymous',
  'visibility',
  'media',
  'accentHue',
  'referenceCardId',
  'slug',
  'excerpt',
  'readMinutes',
  'excerptAt',
] as const;

/** a > b, to the nanosecond (Date would drop the microseconds). */
function later(a: Timestamp, b: Timestamp): boolean {
  return a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
}

/** The stored summary, while it still describes the story; else null. */
export function storedSummary(data: DocumentData | undefined): StorySummary | null {
  if (!data) return null;
  const { excerpt: text, readMinutes: minutes, excerptAt, updatedAt } = data;
  if (typeof text !== 'string' || !Number.isInteger(minutes) || minutes < 1 || !(excerptAt instanceof Timestamp)) return null;
  // A story written since (or an updatedAt that isn't a server stamp) leaves it behind.
  if (updatedAt != null && (!(updatedAt instanceof Timestamp) || later(updatedAt, excerptAt))) return null;
  return { excerpt: text, readMinutes: minutes };
}

/**
 * A card as a list holds it: read with LIST_FIELDS (no story) and carrying
 * its stored summary when that is current — or read whole, with its story.
 */
export type ListCard = Card & { listing?: StorySummary };

export function listCard(id: string, data: DocumentData): ListCard {
  const card: ListCard = mapCard(id, data);
  const stored = storedSummary(data);
  if (stored) card.listing = stored;
  return card;
}

/** The summary a FeedCard shows: from the story when the card was read whole, else the stored one. */
export function summaryOf(card: ListCard): StorySummary {
  if (typeof card.story === 'string') return summarize(card.story);
  return card.listing ?? summarize('');
}

/**
 * Gives every card that was read without its story and has no current stored
 * summary its story — one batched read of just that field — so summaryOf()
 * is right for each. Cards it is given are completed in place.
 */
export async function withStories<T extends ListCard>(db: Firestore, cards: T[]): Promise<T[]> {
  const need = cards.filter((c) => typeof c.story !== 'string' && !c.listing);
  const ids = [...new Set(need.map((c) => c.id))].filter((id) => id && !id.includes('/'));
  if (!ids.length) return cards;
  const snaps = await db.getAll(...ids.map((id) => db.doc(`cards/${id}`)), { fieldMask: ['story'] });
  const stories = new Map(snaps.map((s) => [s.id, s.get('story')]));
  for (const c of need) {
    const story = stories.get(c.id);
    c.story = typeof story === 'string' ? story : '';
  }
  return cards;
}
