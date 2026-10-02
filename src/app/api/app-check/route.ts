import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mintWebToken, spendExchange, verifyTurnstile } from '@/lib/appCheck/server';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

const Body = z.object({ token: z.string().min(1).max(4096) });

const NO_STORE = { 'Cache-Control': 'no-store' };

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * POST /api/app-check `{ token }` — the web's App Check provider (see
 * lib/appCheck/config): a Turnstile token solved on this site, for the
 * action App Check asks, becomes an App Check token for the web app
 * `{ token, ttlMillis }`. Cloudflare refuses a Turnstile token's second use.
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'Bad request');
  const address = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!spendExchange(address ?? 'unknown')) return refuse(429, 'Too many requests');

  const verdict = await verifyTurnstile(body.data.token, { host: new URL(siteUrl()).hostname, remoteIp: address });
  if (!verdict.ok) {
    console.warn(`[appcheck] exchange refused: ${verdict.reason}${verdict.codes?.length ? ` (${verdict.codes.join(', ')})` : ''}`);
    return verdict.reason === 'unconfigured' || verdict.reason === 'unavailable'
      ? refuse(503, 'Unavailable')
      : refuse(403, 'Forbidden');
  }
  try {
    const { token, ttlMillis } = await mintWebToken();
    return NextResponse.json({ token, ttlMillis }, { headers: NO_STORE });
  } catch (e) {
    console.error('[appcheck] minting failed', e);
    return refuse(503, 'Unavailable');
  }
}
