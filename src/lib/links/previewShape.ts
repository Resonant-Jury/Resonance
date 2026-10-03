import type { LinkPreview } from '@/lib/db/types';

/**
 * A link preview as a reader may draw it, from whatever a document holds —
 * a message's `preview`, a card's `linkPreviews` — or undefined. The server
 * wrote these, but a document can hold anything (an older build, a hand
 * edit), so every reader runs this before showing one: an http(s) address
 * and a title are required, and the picture is taken only from our own
 * link-image route (`/api/link-image?…`, which the server signed) — nothing
 * else is ever put in an `<img>`. Client-safe: no server imports.
 */
export function linkPreviewOf(v: unknown): LinkPreview | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  const url = text(p.url);
  const title = text(p.title);
  if (!url || !title || !/^https?:\/\//i.test(url)) return undefined;
  const description = text(p.description);
  const siteName = text(p.siteName);
  const image = text(p.image);
  return {
    url,
    title,
    ...(description ? { description } : {}),
    ...(siteName ? { siteName } : {}),
    ...(image && image.startsWith(LINK_IMAGE_PREFIX) ? { image } : {}),
  };
}

/** A card's `linkPreviews` (in reading order), each checked as above; anything else is an empty list. */
export function linkPreviewsOf(v: unknown, max = 10 /* storyLinks' STORY_PREVIEW_LIMIT */): LinkPreview[] {
  if (!Array.isArray(v)) return [];
  const out: LinkPreview[] = [];
  for (const item of v) {
    const preview = linkPreviewOf(item);
    if (preview) out.push(preview);
    if (out.length >= max) break;
  }
  return out;
}

/** The only pictures a preview may show: our own `/api/link-image` route's (see imageProxy.ts). */
export const LINK_IMAGE_PREFIX = '/api/link-image?';

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
