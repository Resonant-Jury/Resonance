import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getProfileLinks } from '@/lib/api/v1/reads';
import { HandleParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle}/links — cards by others that link to theirs. */
export const GET = withUser(async (user, req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  return cachedJson(req, await getProfileLinks(getAdminDb(), user.id, handle), BRIEF);
});
