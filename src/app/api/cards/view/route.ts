import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { toCardSeed } from '@/lib/data/cardSeed';
import { readCardForPage } from '@/app/[locale]/(app)/card/[slug]/cardPageData';

export const runtime = 'nodejs';

/** As the card page's own ISR: the same for everyone, so the CDN keeps it briefly. */
const VIEW_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

const KEY = /^[A-Za-z0-9_-]{1,160}$/;

/**
 * GET /api/cards/view?key= — a card as a signed-out reader sees it: exactly
 * the card page's server seed (CardSeed: its id, and a public, published
 * card's content — an anonymous one without its author). For a browser with
 * nobody signed in whose own read of a card the rules refuse: an anonymous
 * card names its author, so only the server may hand it out.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')?.trim() ?? '';
  if (!KEY.test(key)) return NextResponse.json({ id: null, view: null }, { headers: { 'Cache-Control': 'no-store' } });
  const loaded = await readCardForPage(getAdminDb(), key);
  const seed = toCardSeed(loaded.id, loaded.card, loaded.author);
  // Nothing to show is never kept: the card may be published a moment later.
  return NextResponse.json(seed, { headers: { 'Cache-Control': seed.view ? VIEW_CACHE : 'no-store' } });
}
