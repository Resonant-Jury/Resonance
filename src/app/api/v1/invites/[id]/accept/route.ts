import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { acceptInvite } from '@/lib/api/v1/invites';
import { InviteIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/** POST /api/v1/invites/{id}/accept — accept a legacy invite sent to you (see acceptInvite). */
export const POST = withUser(async (user, _req, ctx: RouteContext<'id'>) => {
  const id = parse(InviteIdParam, await routeParam(ctx, 'id'));
  const db = getAdminDb();
  await spend(db, user.id, 'invite');
  const { notificationId, ...accepted } = await acceptInvite(db, user.id, id);
  ringAfter(db, notificationId);
  return NextResponse.json(accepted);
});
