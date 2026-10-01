import { parse, withUser } from '@/lib/api/v1/http';
import { FeedQuery } from '@/lib/api/v1/schemas';
import { getFeed } from '@/lib/api/v1/service';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/feed?limit=&pageToken= (or the older &cursor=) — latest public cards (see openapi/v1/openapi.json). */
export const GET = withUser(async (user, req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { limit, cursor, pageToken } = parse(FeedQuery, params);
  return cachedJson(req, await getFeed(getAdminDb(), user.id, limit, { cursor, pageToken }), BRIEF);
});
