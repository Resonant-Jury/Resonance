import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
const appPathPattern = /^\/(en|zh-TW)\/(home|card|write|me|u|settings)(\/|$)/;

export default function middleware(request: NextRequest) {
  const usingMock =
    process.env.DATA_PROVIDER === 'mock' ||
    (process.env.DATA_PROVIDER === undefined && process.env.NEXT_PUBLIC_USE_MOCK !== 'false');

  if (!usingMock && appPathPattern.test(request.nextUrl.pathname)) {
    const sessionCookieName = process.env.FIREBASE_SESSION_COOKIE_NAME ?? '__session';
    const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);
    if (!hasSession) {
      const [, locale] = request.nextUrl.pathname.split('/');
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/signin`;
      url.searchParams.set(
        'next',
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(en|zh-TW)/:path*', '/((?!_next|_vercel|api|.*\\..*).*)'],
};
