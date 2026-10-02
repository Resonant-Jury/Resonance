import { storageKeyOf } from '@/lib/storage/publicUrl';

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
 * A cover must be on our own storage (`publicBase`, when the server knows it)
 * unless it is the one the card already has (`keptMediaUrl`) — as the rules
 * check a cover only when it changes, so an older card stays editable.
 */
export function cardContentProblem(
  c: CardContent,
  opts: { keptMediaUrl?: string | null; publicBase?: string } = {},
): string | null {
  const publicBase = 'publicBase' in opts ? opts.publicBase : process.env.R2_PUBLIC_BASE;
  if (c.thoughtCore.length > CARD_LIMITS.title) return 'thoughtCore';
  if (c.story.length > CARD_LIMITS.story) return 'story';
  if (c.tags.length > CARD_LIMITS.tags || c.tags.join(' ').length > CARD_LIMITS.tagsJoined) return 'tags';
  if (c.accentHue != null && !(c.accentHue >= 0 && c.accentHue <= 360)) return 'accentHue';
  const m = c.media;
  if (m) {
    if (m.type !== 'image' && m.type !== 'video') return 'media';
    if (!/^https:\/\/\S+$/.test(m.url) || m.url.length > CARD_LIMITS.url) return 'media';
    // Our own storage only, where the server knows it (the rules hold the same once config/storage is set).
    if (publicBase && m.url !== opts.keptMediaUrl && !storageKeyOf(m.url, publicBase)) return 'media';
    if (m.label != null && (typeof m.label !== 'string' || m.label.length > CARD_LIMITS.mediaLabel)) return 'media';
  }
  return null;
}
