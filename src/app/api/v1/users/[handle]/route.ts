import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getProfile } from '@/lib/api/v1/reads';
import { HandleParam, ProfileQuery } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle}?include=cards,links&limit= — a person's public profile, as the viewer sees it (and its lists). */
export const GET = withUser(async (user, req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  const { include, limit } = parse(ProfileQuery, Object.fromEntries(new URL(req.url).searchParams));
  const profile = await getProfile(getAdminDb(), user.id, handle, { include, limit });
  // Their own profile may be one they just edited.
  return cachedJson(req, profile, profile.isSelf ? OWN : BRIEF);
});
