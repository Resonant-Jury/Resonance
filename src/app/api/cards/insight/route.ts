import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { extractInsightSignature } from '@/lib/ai/tasks';

export const runtime = 'nodejs';
// One LLM extraction — same budget as the index route.
export const maxDuration = 60;

/**
 * Pre-publish "mirror moment" (ux §5–6): distill the draft's core insight so
 * the publish panel can echo it back to the author before they commit. The
 * draft may be unsaved, so the editor state travels in the body. Returns ONLY
 * `coreInsight` — the insight score is server-side policy and is never shown.
 */
export async function POST(req: Request) {
  await requireUser();

  const body = (await req.json().catch(() => null)) as {
    thoughtCore?: unknown;
    story?: unknown;
  } | null;
  const thoughtCore = typeof body?.thoughtCore === 'string' ? body.thoughtCore : '';
  const story = typeof body?.story === 'string' ? body.story : '';
  if (!story.trim() && !thoughtCore.trim()) {
    return NextResponse.json({ coreInsight: null });
  }

  try {
    const signature = await extractInsightSignature({ title: thoughtCore, story });
    return NextResponse.json({ coreInsight: signature.coreInsight || null });
  } catch {
    // The mirror is a grace note — publishing must never depend on it.
    return NextResponse.json({ coreInsight: null });
  }
}
