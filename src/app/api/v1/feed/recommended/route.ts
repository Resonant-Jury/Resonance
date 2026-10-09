import { after } from 'next/server';
import { withUser } from '@/lib/api/v1/http';
import { getRecommendedFeed } from '@/lib/api/v1/reads';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { dailyRecommendations } from '@/lib/recommend/daily';
import { NEVER, cachedJson, secondsUntilUtcMidnight } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';
// A new day's build runs after the response (its LLM steps time out well inside this).
export const maxDuration = 60;

/**
 * GET /api/v1/feed/recommended — today's picks for the reader, each with its
 * reason (see dailyRecommendations). Today's picks stay the same until the
 * UTC day turns, so a client that opted in may keep them until then; picks
 * still being prepared (`stale`) are never kept — the client asks again.
 */
export const GET = withUser(async (user, req) => {
  const feed = await getRecommendedFeed(getAdminDb(), user.id, async (db, uid) => {
    const daily = await dailyRecommendations(db, uid);
    if (daily.refresh) after(daily.refresh);
    // The reader opened their picks today: the evening's pick push leaves them be.
    if (daily.asked) after(daily.asked);
    return daily;
  });
  return cachedJson(req, feed, feed.status === 'stale' ? NEVER : { kind: 'fresh', maxAge: secondsUntilUtcMidnight() });
});
