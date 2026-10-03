import { NextResponse, after } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getResonances } from '@/lib/api/v1/reads';
import { resonateWith } from '@/lib/api/v1/resonate';
import { CardIdParam, ResonateRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { spend } from '@/lib/api/rateLimit';
import { ringAfter } from '@/lib/push/ring';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards/{id}/resonances — public cards written in response to this one. */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  return cachedJson(req, await getResonances(getAdminDb(), user.id, id), BRIEF);
});

/**
 * POST /api/v1/cards/{id}/resonances — make one of your published public
 * cards a resonance of this one (see resonateWith). After the response the
 * original author's bell rings (the first time only), and your card's pages
 * are revalidated: their seed names the card it answers.
 */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const target = parse(CardIdParam, await routeParam(ctx, 'key'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const { cardId } = parse(ResonateRequest, body);
  const db = getAdminDb();
  await spend(db, user.id, 'resonate');
  const { notificationId, stale, ...result } = await resonateWith(db, user.id, target, cardId);
  ringAfter(db, notificationId);
  if (stale.length) after(() => void revalidateLocalized(stale));
  return NextResponse.json(result);
});
