import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { cardByKey } from '@/lib/db/firestore/cardKey';

export const runtime = 'nodejs';

/**
 * Resolve a card URL segment (slug or legacy doc id) to its Firestore doc id.
 *
 * This returns *only* the id — never card content — so it leaks nothing about
 * private cards. The caller then reads the card through the visibility-enforced
 * `get` rule, which is what actually gates access.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')?.trim();
  if (!key) return NextResponse.json({ id: null });

  const card = await cardByKey(getAdminDb(), key);
  return NextResponse.json({ id: card?.id ?? null });
}
