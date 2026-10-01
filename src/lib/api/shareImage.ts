import sharp from 'sharp';
import { getStorageProvider } from '@/lib/storage';
import { storageKeyOf } from '@/lib/storage/publicUrl';
import { MAX_INPUT_PIXELS } from '@/lib/storage/image';
import { OG_COVER_PATH, imageVersion } from '@/lib/og';

/**
 * Share images (og:image): one of our stored pictures — AVIF or WebP, which
 * some platforms can't show — served as a JPEG at most 1200 px a side
 * (/api/og/card/{id}, /api/og/user/{id}). The same for everyone, so the CDN
 * keeps it; the URL carries the picture's version (`v`, see imageVersion),
 * so a new cover is a new URL. A day, not longer: a card made private or an
 * account deleted stops being shared by the CDN within one.
 */
export const SHARE_IMAGE_EDGE = 1200;
/** The most a stored picture may weigh to be turned into a share image (uploads are far smaller). */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const CACHE_VERSIONED = 'public, max-age=86400, s-maxage=86400';
/** A URL naming another version (the page was rendered before the picture changed): briefly. */
const CACHE_UNVERSIONED = 'public, max-age=300, s-maxage=300';
/** Nothing to share (not public, no picture, unreadable): the platform cover, for a minute. */
const CACHE_FALLBACK = 'public, max-age=60, s-maxage=60';

/** A picture as a share image: upright, at most 1200 px a side, on the paper colour where it was transparent, JPEG. */
export async function toShareJpeg(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(SHARE_IMAGE_EDGE, SHARE_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#faf2e9' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Where to send a share-image request with nothing to share: the platform cover. */
export function shareImageFallback(): Response {
  return new Response(null, { status: 302, headers: { Location: OG_COVER_PATH, 'Cache-Control': CACHE_FALLBACK } });
}

/**
 * The share image for `sourceUrl` — only ever one of our stored pictures
 * (read through the storage API by its key, never fetched from an arbitrary
 * URL) — or the platform cover.
 */
export async function shareImageResponse(req: Request, sourceUrl: string | null | undefined): Promise<Response> {
  const key = storageKeyOf(sourceUrl);
  if (!sourceUrl || !key) return shareImageFallback();
  let jpeg: Buffer;
  try {
    const bytes = await getStorageProvider().getObject(key, MAX_SOURCE_BYTES);
    if (!bytes) return shareImageFallback();
    jpeg = await toShareJpeg(bytes);
  } catch (e) {
    console.error('[og] share image', key, e);
    return shareImageFallback();
  }
  const current = new URL(req.url).searchParams.get('v') === imageVersion(sourceUrl);
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.byteLength),
      'Cache-Control': current ? CACHE_VERSIONED : CACHE_UNVERSIONED,
    },
  });
}
