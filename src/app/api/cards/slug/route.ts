import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { assignSlug } from '@/lib/ai/assignSlug';

export const runtime = 'nodejs';

/**
 * Generate (and persist) a card's URL slug. Called automatically right after a
 * card is published — the user never sets it by hand. The slug is the LLM's
 * English translation of the title, made collision-free with the author handle
 * and then a numeric suffix. Idempotent: an existing slug is returned as-is so
 * the public URL stays stable across re-publishes.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const body = (await req.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === 'string' ? body.cardId : '';
  if (!cardId) {
    return NextResponse.json({ error: 'Missing cardId' }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection('cards').doc(cardId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }
  const data = snap.data() ?? {};
  if (data.authorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ slug: await assignSlug(db, cardId) });
}
