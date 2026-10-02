import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';
import { getCurrentUser } from '@/lib/auth';
import { REVALIDATE_MAX_PATHS, revalidateLocalized } from '@/lib/api/revalidate';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { cardByKey } from '@/lib/db/firestore/cardKey';
import { handleKey } from '@/lib/db/firestore/handles';

const Body = z.object({ paths: z.array(z.string().min(1).max(512)).max(REVALIDATE_MAX_PATHS) });

function segment(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes('/') || rest.includes('?') || rest.includes('#')) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/**
 * Whether `uid` may drop the cached page at `path`: one of their own cards
 * (by id or slug), a card one of their cards answers (its resonance count
 * changed), or their own profile under its current pen name. The browser
 * asks after the writes it still makes itself (a profile field, a card
 * edit); everything the server writes drops its own pages.
 */
async function mayRevalidate(db: Firestore, uid: string, path: string, profile: () => Promise<string | null>): Promise<boolean> {
  const key = segment(path, '/card/');
  if (key) {
    const card = await cardByKey(db, key);
    if (!card) return false;
    if (card.get('authorId') === uid) return true;
    const answer = await db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '==', card.id).limit(1).get();
    return !answer.empty;
  }
  const handle = segment(path, '/u/');
  if (handle) {
    const own = await profile();
    return !!own && handleKey(handle) === own;
  }
  return false;
}

/**
 * POST /api/revalidate { paths } — drop the ISR copies of pages the signed-in
 * person's own browser writes just changed (logical paths, every locale).
 * At most {@link REVALIDATE_MAX_PATHS}, each one theirs to drop; anything
 * else is left alone (and listed nowhere in the answer).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const db = getAdminDb();
  let handle: Promise<string | null> | null = null;
  const profile = () =>
    (handle ??= db.doc(`users/${user.id}`).get().then((s) => {
      const lower = s.get('handleLower');
      return typeof lower === 'string' && lower ? lower : null;
    }));
  const unique = [...new Set(parsed.data.paths)];
  const allowed = await Promise.all(unique.map((p) => mayRevalidate(db, user.id, p, profile).catch(() => false)));
  const paths = unique.filter((_, i) => allowed[i]);
  if (!paths.length) return NextResponse.json({ ok: true, revalidated: [] });

  // Routes are locale-prefixed (localePrefix: 'always'), so a logical path
  // like `/card/x` lives at `/en/card/x` and `/zh-TW/card/x`: each is
  // revalidated in every locale, otherwise nothing matches.
  return NextResponse.json({ ok: true, revalidated: revalidateLocalized(paths) });
}
