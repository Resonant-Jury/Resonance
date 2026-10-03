import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCard } from '@/lib/recommend/indexCard';
import { ringAfter } from '@/lib/push/ring';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/v1/cards/{id}/edits/apply — apply your pending edit to a
 * published card (see applyCardEdit). A resonance it made public under your
 * name rings the original's author after the response.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const db = getAdminDb();
  const { stale, notificationId, ...result } = await applyCardEdit(db, user.id, id);
  ringAfter(db, notificationId);
  if (result.applied) {
    after(async () => {
      // After "save changes": the cached pages, then the recommendation index.
      revalidateLocalized(stale);
      await indexCard(id).catch((e) => console.error('[api/v1] index', e));
    });
  }
  return NextResponse.json(result);
});
