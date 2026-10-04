import { publicBases, storageKeyOf } from '@/lib/storage/publicUrl';

/**
 * firestore.rules' `validCardContent`, for content the server copies on the
 * author's behalf (applying a pending edit): a client can't get past the
 * rules, and the server must not be the way around them. Keep the two in step.
 * Lengths are counted as the rules count them: in UTF-16 units, as
 * JavaScript's `length` does (an emoji is two).
 */
export const CARD_LIMITS = {
  title: 200,
  story: 200_000,
  tags: 30,
  /** The tags joined by a space. */
  tagsJoined: 1000,
  mediaLabel: 200,
  url: 2048,
} as const;

export interface CardContent {
  thoughtCore: string;
  story: string;
  tags: string[];
  media?: { type: string; url: string; label?: string } | null;
  accentHue?: number | null;
}

/**
 * What is out of bounds in `c` (the field's name), or null when it all fits.
 * A cover must be on our own storage (`publicBases`, when the server knows
 * them: R2_PUBLIC_BASE, or a former base still serving the same keys during a
 * move) unless it is the one the card already has (`keptMediaUrl`) — as the
 * rules check a cover only when it changes, so an older card stays editable.
 */
export function cardContentProblem(
  c: CardContent,
  opts: { keptMediaUrl?: string | null; publicBases?: readonly string[] } = {},
): string | null {
  const bases = 'publicBases' in opts ? (opts.publicBases ?? []) : publicBases();
  if (c.thoughtCore.length > CARD_LIMITS.title) return 'thoughtCore';
  if (c.story.length > CARD_LIMITS.story) return 'story';
  if (c.tags.length > CARD_LIMITS.tags || c.tags.join(' ').length > CARD_LIMITS.tagsJoined) return 'tags';
  if (c.accentHue != null && !(c.accentHue >= 0 && c.accentHue <= 360)) return 'accentHue';
  const m = c.media;
  if (m) {
    if (m.type !== 'image' && m.type !== 'video') return 'media';
    if (!/^https:\/\/\S+$/.test(m.url) || m.url.length > CARD_LIMITS.url) return 'media';
    // Our own storage only, where the server knows it (the rules hold the same once config/storage is set: its host or a former one).
    if (bases.length && m.url !== opts.keptMediaUrl && !storageKeyOf(m.url, bases)) return 'media';
    if (m.label != null && (typeof m.label !== 'string' || m.label.length > CARD_LIMITS.mediaLabel)) return 'media';
  }
  return null;
}

/**
 * Whether a card (or a pending edit, as applying it would leave the card) is
 * anonymous and shown to its author's connections only — which no card may
 * become. Whether a reader may open such a card would turn on whether they
 * are connected to its author, and blocking someone ends the connection: the
 * card vanishing as a reader blocked someone would tell them who wrote it.
 * So an anonymous card is public or private. firestore.rules hold the client
 * to the same (`anonymousForConnections`); a card already that way is left as
 * it is, editable in everything else (scripts/integrity.ts lists them).
 */
export function anonymousForConnections(c: { anonymous?: unknown; visibility?: unknown }): boolean {
  return c.anonymous === true && c.visibility === 'connections';
}

/** The refusal for a change that would make a card anonymous and for connections only. */
export const ANONYMOUS_VISIBILITY_MESSAGE = 'An anonymous card is public or private.';

const VISIBILITIES: readonly unknown[] = ['public', 'connections', 'private'];

/**
 * The visibility and byline a pending edit (cards/{id}/edits/current) leaves
 * its card with when applied: the edit's own — its visibility only when it is
 * one of the three, else the card's (lib/api/v1/edits).
 */
export function editedAudience(
  edit: { visibility?: unknown; anonymous?: unknown },
  card: { visibility?: unknown },
): { visibility: unknown; anonymous: boolean } {
  return { visibility: VISIBILITIES.includes(edit.visibility) ? edit.visibility : card.visibility, anonymous: edit.anonymous === true };
}
