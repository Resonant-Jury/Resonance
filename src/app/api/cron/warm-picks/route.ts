import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { warmPicks } from '@/lib/recommend/warm';
import { cronAuthorized } from '@/lib/api/cronAuth';

export const dynamic = 'force-dynamic';
// Pinned to hnd1 in vercel.json: the builds call OpenAI, which refuses Hong Kong.
export const maxDuration = 300;

/**
 * How long a run starts builds: maxDuration less the longest a build takes
 * (two LLM steps that time out at 20 + 25 s, and their reads), so none is cut
 * off half way. Readers not reached are built when they next ask.
 */
const WARM_BUDGET_MS = (maxDuration - 60) * 1000;

/**
 * Daily warm-up of tonight's picks (vercel.json: 11:00 UTC, an hour before
 * /api/cron/push-picks; see lib/recommend/warm). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; anyone else, and everyone while the
 * secret is unset, is refused.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const run = await warmPicks(getAdminDb(), { deadline: Date.now() + WARM_BUDGET_MS });
  console.log('[warm-picks]', JSON.stringify(run));
  return NextResponse.json(run);
}
