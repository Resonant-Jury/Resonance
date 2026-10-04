import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { dailyRecommendations } from '@/lib/recommend/daily';

export const runtime = 'nodejs';
// A new day's build runs after the response (its LLM steps time out well inside this).
export const maxDuration = 60;

/**
 * The reader's recommended feed: the stored result at once (`status: 'stale'`
 * while today's is built after the response), or — for a reader with nothing
 * yet — a quick build within a few seconds. Returns only card ids + reasons;
 * the client resolves the cards through the visibility-enforced read path.
 * Never the ranking's scores: what lifted a card is the server's to know
 * (a score past the model's range would say the author was one the reader
 * answered).
 */
export async function GET() {
  const user = await getCurrentUser({ revocation: 'cached' });
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { items, cached, status, refresh } = await dailyRecommendations(getAdminDb(), user.id);
  if (refresh) after(refresh);
  return NextResponse.json({ items: items.map(({ cardId, reason }) => ({ cardId, reason })), cached, status });
}
