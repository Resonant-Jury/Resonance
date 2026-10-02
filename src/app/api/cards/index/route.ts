import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCard } from '@/lib/recommend/indexCard';
import { limited } from '@/lib/api/rateLimit';

export const runtime = 'nodejs';
// One LLM extraction + one embeddings call — comfortably under a minute.
export const maxDuration = 60;

/**
 * Build (or refresh) a card's recommendation index entry. Called fire-and-forget
 * right after publish — extracts the insight signature and writes its vectors.
 * Owner-gated; failure never blocks publishing (the editor ignores the result).
 */
export async function POST(req: Request) {
  // Signed out (or a revoked session) is a 401 — what makes a client renew its token — not a crash.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

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
  const refused = await limited(getAdminDb(), user.id, 'index');
  if (refused) return refused;

  const result = await indexCard(cardId);
  return NextResponse.json(result);
}
