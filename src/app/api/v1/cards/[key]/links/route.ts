import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getLinksToCard } from '@/lib/api/v1/reads';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards/{id}/links — cards linking to it (its author only). */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  return cachedJson(req, await getLinksToCard(getAdminDb(), user.id, id), BRIEF);
});
