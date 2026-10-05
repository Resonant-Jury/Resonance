import { getAdminDb } from '@/lib/db/firestore/admin';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { shareImageFallback, shareImageResponse } from '@/lib/api/shareImage';

export const runtime = 'nodejs';

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /api/og/card/{id}?v= — a card's cover as its share image (a JPEG; see
 * lib/api/shareImage), the og:image of its page. Only a public, published
 * card's cover, as a signed-out reader would see it: anything else gets the
 * platform cover. Nothing but the picture is read — never the author.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // An id Firestore keeps for itself (`__x__`) would make the read throw: it is no such card.
  if (!DOC_ID.test(id) || isReservedId(id)) return shareImageFallback();
  const data = (await getAdminDb().doc(`cards/${id}`).get()).data();
  if (!data || data.visibility !== 'public' || data.publishedAt == null) return shareImageFallback();
  const media = data.media as { type?: unknown; url?: unknown } | undefined;
  if (media?.type !== 'image' || typeof media.url !== 'string') return shareImageFallback();
  return shareImageResponse(req, media.url);
}
