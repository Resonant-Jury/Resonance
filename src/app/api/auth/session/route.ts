import { NextResponse } from 'next/server';
import { createSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/firebase/server';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { idToken?: string } | null;
  if (!body?.idToken) {
    return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
  }

  const sessionCookie = await createSessionCookie(body.idToken);
  const expiresIn =
    Number(process.env.FIREBASE_SESSION_EXPIRES_IN_DAYS ?? 7) * 24 * 60 * 60 * 1000;

  const res = NextResponse.json({ ok: true });
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
