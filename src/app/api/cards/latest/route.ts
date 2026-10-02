import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { FeedQuery } from '@/lib/api/v1/schemas';
import { getFeed } from '@/lib/api/v1/service';

export const runtime = 'nodejs';

/** The same for every signed-out reader: the CDN keeps a page briefly. */
const LATEST_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=120';

/**
 * GET /api/cards/latest?limit=&cursor= — the latest public cards for a
 * reader nobody is signed in as: what GET /api/v1/feed answers, without a
 * viewer (so without blocks). Anonymous cards are in it without their byline
 * — the rules keep them out of the browser's own queries, since their
 * documents name their authors.
 */
export async function GET(req: Request) {
  const parsed = FeedQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const { limit, cursor } = parsed.data;
  return NextResponse.json(await getFeed(getAdminDb(), null, limit, cursor), { headers: { 'Cache-Control': LATEST_CACHE } });
}
