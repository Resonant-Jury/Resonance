import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { unresonate } from '@/lib/api/v1/resonate';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { revalidateLocalized } from '@/lib/api/revalidate';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/cards/{id}/resonances/{cardId} — your card stops answering
 * this one and stays, as a card of its own, taking back the connection it
 * made while the two of you have written each other nothing (see
 * unresonate); 204 whether or not it still did.
 */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'key' | 'cardId'>) => {
  const target = parse(CardIdParam, await routeParam(ctx, 'key'));
  const cardId = parse(CardIdParam, await routeParam(ctx, 'cardId'));
  const { stale } = await unresonate(getAdminDb(), user.id, target, cardId);
  if (stale.length) after(() => void revalidateLocalized(stale));
  return new NextResponse(null, { status: 204 });
});
