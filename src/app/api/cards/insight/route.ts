import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { limited } from '@/lib/api/rateLimit';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { DRAFT_READ_CHARS, draftUnits, MIN_DRAFT_UNITS } from '@/lib/ai/mirror';
import { mirrorInsight } from '@/lib/ai/tasks';
import { CARD_LIMITS } from '@/lib/db/firestore/cardContent';

export const runtime = 'nodejs';
// One LLM extraction — same budget as the index route.
export const maxDuration = 60;

/**
 * Pre-publish "mirror moment" (ux §5–6): distill the draft's core insight so
 * the publish panel can echo it back to the author before they commit — in
 * the draft's own language, and `coreInsight: null` (no line at all) when
 * there is nothing to say (`mirrorInsight`, lib/ai/mirror). The draft may be
 * unsaved, so the editor state travels in the body. Returns ONLY
 * `coreInsight`.
 */
export async function POST(req: Request) {
  // Signed out (or a revoked session) is a 401 — what makes a client renew its token — not a crash.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    thoughtCore?: unknown;
    story?: unknown;
  } | null;
  // Only the draft's start is read (DRAFT_READ_CHARS, lib/ai/mirror), cut before anything measures it: the
  // body has no size limit of its own, and reading all of a long one is work done before any budget is spent.
  const thoughtCore = typeof body?.thoughtCore === 'string' ? body.thoughtCore.slice(0, CARD_LIMITS.title) : '';
  const story = typeof body?.story === 'string' ? body.story.slice(0, DRAFT_READ_CHARS) : '';
  // Too little to reflect: nothing to say, and nothing spent on saying it.
  if (draftUnits(thoughtCore, story) < MIN_DRAFT_UNITS) {
    return NextResponse.json({ coreInsight: null });
  }
  const refused = await limited(getAdminDb(), user.id, 'insight');
  if (refused) return refused;

  try {
    return NextResponse.json({ coreInsight: await mirrorInsight({ title: thoughtCore, story }) });
  } catch {
    // The mirror is a grace note — publishing must never depend on it.
    return NextResponse.json({ coreInsight: null });
  }
}
