import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';

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

  const db = getAdminDb();
  const bySlug = await db.collection('cards').where('slug', '==', key).limit(1).get();
  if (!bySlug.empty) {
    return NextResponse.json({ id: bySlug.docs[0].id });
  }

  const byId = await db.collection('cards').doc(key).get();
  return NextResponse.json({ id: byId.exists ? byId.id : null });
}
