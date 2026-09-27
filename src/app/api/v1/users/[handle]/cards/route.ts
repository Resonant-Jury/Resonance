import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getProfileCards } from '@/lib/api/v1/reads';
import { FeedQuery, HandleParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle}/cards?limit=&cursor= — their public cards, newest first. */
export const GET = withUser(async (user, req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  const { limit, cursor } = parse(FeedQuery, Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await getProfileCards(getAdminDb(), user.id, handle, limit, cursor));
});
