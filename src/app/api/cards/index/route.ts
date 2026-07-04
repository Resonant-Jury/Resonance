import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCard } from '@/lib/recommend/indexCard';

export const runtime = 'nodejs';
// One LLM extraction + one embeddings call — comfortably under a minute.
export const maxDuration = 60;

/**
 * Build (or refresh) a card's recommendation index entry. Called fire-and-forget
 * right after publish — extracts the insight signature and writes its vectors.
 * Owner-gated; failure never blocks publishing (the editor ignores the result).
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const body = (await req.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === 'string' ? body.cardId : '';
  if (!cardId) {
    return NextResponse.json({ error: 'Missing cardId' }, { status: 400 });
  }

  const snap = await getAdminDb().collection('cards').doc(cardId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }
  if (snap.data()?.authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await indexCard(cardId);
  return NextResponse.json(result);
}
