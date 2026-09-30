import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { NotificationIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { assertRingable, ringAfter } from '@/lib/push/ring';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/{id}/push — the web asks for the push of a bell row
 * it just wrote from the browser (see assertRingable). Not part of v1: the
 * apps' writes go through the API, which pushes on its own.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'id'>) => {
  const id = parse(NotificationIdParam, await routeParam(ctx, 'id'));
  const db = getAdminDb();
  await assertRingable(db, user.id, id);
  await spend(db, user.id, 'ring');
  ringAfter(db, id);
  return new NextResponse(null, { status: 202 });
});
