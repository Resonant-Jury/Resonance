import { NextResponse } from 'next/server';
import { getAdminDb, getAdminMessaging } from '@/lib/db/firestore/admin';
import { pushPicks } from '@/lib/push/picks';
import { cronAuthorized } from '@/lib/api/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** How long a run starts pushes: maxDuration less a margin for those under way (readers not reached wait for tomorrow). */
const PICKS_BUDGET_MS = (maxDuration - 30) * 1000;

/**
 * Daily "a card for tonight" (vercel.json: 12:00 UTC = 20:00 Taipei; see
 * lib/push/picks). It only reads the picks the warm-up built an hour before —
 * nothing here reaches the LLM, so it runs beside Firestore in Hong Kong.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anyone else, and
 * everyone while the secret is unset, is refused.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const run = await pushPicks(getAdminDb(), await getAdminMessaging(), { deadline: started + PICKS_BUDGET_MS });
  console.log('[push-picks]', JSON.stringify(run));
  return NextResponse.json(run);
}
