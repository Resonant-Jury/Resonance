import { NextResponse, after } from 'next/server';
import { withUser } from '@/lib/api/v1/http';
import { getRecommendedFeed } from '@/lib/api/v1/reads';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { dailyRecommendations } from '@/lib/recommend/daily';

export const dynamic = 'force-dynamic';
// A new day's build runs after the response (its LLM steps time out well inside this).
export const maxDuration = 60;

/** GET /api/v1/feed/recommended — today's picks for the reader, each with its reason (see dailyRecommendations). */
export const GET = withUser(async (user) =>
  NextResponse.json(
    await getRecommendedFeed(getAdminDb(), user.id, async (db, uid) => {
      const daily = await dailyRecommendations(db, uid);
      if (daily.refresh) after(daily.refresh);
      return daily;
    }),
  ),
);
