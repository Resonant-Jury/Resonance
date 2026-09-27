import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { dailyRecommendations } from '@/lib/recommend/daily';

export const runtime = 'nodejs';
// The funnel runs the rerank + select LLM calls; only on a cache miss.
export const maxDuration = 120;

/**
 * The reader's recommended feed. Returns a cached daily result when fresh, and
 * only runs the (LLM-bearing) funnel on a cache miss — keeping per-read cost
 * near zero. Returns only card ids + reasons; the client resolves the cards
 * through the visibility-enforced read path.
 */
export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await dailyRecommendations(getAdminDb(), user.id));
}
