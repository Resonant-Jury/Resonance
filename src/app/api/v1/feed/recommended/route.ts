import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api/v1/http';
import { getRecommendedFeed } from '@/lib/api/v1/reads';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { dailyRecommendations } from '@/lib/recommend/daily';

export const dynamic = 'force-dynamic';
// On a cache miss the recommendation funnel runs its LLM calls (once a day per reader).
export const maxDuration = 120;

/** GET /api/v1/feed/recommended — today's picks for the reader, each with its reason. */
export const GET = withUser(async (user) =>
  NextResponse.json(await getRecommendedFeed(getAdminDb(), user.id, (db, uid) => dailyRecommendations(db, uid))),
);
