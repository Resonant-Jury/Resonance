import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getResonances } from '@/lib/api/v1/reads';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards/{id}/resonances — public cards written in response to this one. */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  return cachedJson(req, await getResonances(getAdminDb(), user.id, id), BRIEF);
});
