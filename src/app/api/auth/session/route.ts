import { NextResponse } from 'next/server';
import { createSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/firebase/server';

/**
 * Whether a sign-in POST comes from this site's own pages. A page elsewhere
 * could otherwise sign a visitor's browser in as the page's author (login
 * CSRF): a cross-site form can't send JSON, and a cross-site fetch carries
 * its Origin, which must be this host. (The apps never come here: they send
 * their ID token with each API call.)
 */
function fromOwnPage(req: Request): boolean {
  const type = req.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type)) return false;
  const origin = req.headers.get('origin');
  // Browsers send Origin with every POST a page makes; without one, this is
  // no other site's page (no browser at all, or one saying it's our own).
  if (!origin) return req.headers.get('sec-fetch-site') == null || req.headers.get('sec-fetch-site') === 'same-origin';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!fromOwnPage(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { idToken?: string } | null;
  if (!body?.idToken) {
    return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
  }

  // An expired, revoked or forged token is a sign-in that didn't happen: 401, not a crash.
  const sessionCookie = await createSessionCookie(body.idToken).catch(() => null);
  if (!sessionCookie) return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
  const expiresIn =
    Number(process.env.FIREBASE_SESSION_EXPIRES_IN_DAYS ?? 7) * 24 * 60 * 60 * 1000;

  // The browser remembers when to mint the next one (ensureSession).
  const res = NextResponse.json({ ok: true, expiresIn });
  res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(expiresIn / 1000),
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return res;
}
