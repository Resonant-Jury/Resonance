import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getCardDetail } from '@/lib/api/v1/reads';
import { CardKey } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards/{key} — a card (by slug or id) the viewer may read, with its story. */
export const GET = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const key = parse(CardKey, await routeParam(ctx, 'key'));
  return NextResponse.json(await getCardDetail(getAdminDb(), user.id, key));
});
