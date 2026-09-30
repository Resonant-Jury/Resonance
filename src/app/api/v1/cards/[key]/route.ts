import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getCardDetail } from '@/lib/api/v1/reads';
import { CardDetailQuery, CardKey } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cards/{key}?include=resonances,related,links,embeds — a card
 * (by slug or id) the viewer may read, with its story, and the lists asked for.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const key = parse(CardKey, await routeParam(ctx, 'key'));
  const { include } = parse(CardDetailQuery, Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await getCardDetail(getAdminDb(), user.id, key, include));
});
