import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { cardByKey } from '@/lib/db/firestore/cardKey';

export const runtime = 'nodejs';

/**
 * A hit is the same for every viewer (an id, never content), so the CDN may
 * keep it: an hour fresh, then served while it refreshes. Not longer — a
 * deleted card's slug can be given to a new card, and until the cached answer
 * lapses its URL still names the old id (which then reads as not found).
 */
const RESOLVE_HIT_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
/** A miss is never cached: the card may be about to exist (a slug assigned a moment later). */
const RESOLVE_MISS_CACHE = 'no-store';

/**
 * Resolve a card URL segment (slug or legacy doc id) to its Firestore doc id.
 *
 * This returns *only* the id — never card content — so it leaks nothing about
 * private cards. The caller then reads the card through the visibility-enforced
 * `get` rule, which is what actually gates access. The card page itself gets
 * the id from its server render and only comes here when that id no longer
 * reads; embedded cards and shared-card rows come here first.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')?.trim();
  const card = key ? await cardByKey(getAdminDb(), key) : null;
  return NextResponse.json(
    { id: card?.id ?? null },
    { headers: { 'Cache-Control': card ? RESOLVE_HIT_CACHE : RESOLVE_MISS_CACHE } },
  );
}
