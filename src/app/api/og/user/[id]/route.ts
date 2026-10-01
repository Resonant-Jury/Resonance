import { getAdminDb } from '@/lib/db/firestore/admin';
import { shareImageFallback, shareImageResponse } from '@/lib/api/shareImage';

export const runtime = 'nodejs';

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /api/og/user/{id}?v= — a person's profile photo as their profile
 * page's share image (a JPEG; see lib/api/shareImage). Profiles are public;
 * someone without a photo, or gone, gets the platform cover.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!DOC_ID.test(id)) return shareImageFallback();
  const avatarUrl = (await getAdminDb().doc(`users/${id}`).get()).data()?.avatarUrl;
  return shareImageResponse(req, typeof avatarUrl === 'string' ? avatarUrl : null);
}
