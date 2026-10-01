import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { securityHeaders } from './src/lib/api/securityHeaders';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // ── Prevent Webpack from vendor-chunking Firebase on the server ──────
  // Next.js 15 (Webpack) generates vendor chunks named after the package
  // scope, e.g. `vendor-chunks/@firebase.js`. The `@` in the scoped name
  // causes a require-path mismatch at runtime → "Cannot find module
  // './vendor-chunks/@firebase.js'".  Marking these as external tells
  // Next.js to resolve them via Node's native `require()` instead of
  // bundling, which handles scoped packages correctly.
  serverExternalPackages: ['firebase', 'firebase-admin'],

  // ── How long stale ISR HTML may still be served ──────────────────────
  // A page past its `revalidate` is served stale while it regenerates in
  // the background (s-maxage=<revalidate>, stale-while-revalidate=
  // <expireTime − revalidate>). Next's default is a year, so the first
  // visitor to a card nobody opened for months got months-old HTML: a story
  // since edited — or made private or deleted by a write no server saw
  // (older app builds still write straight to Firestore) — reached crawlers
  // and readers without JavaScript. A day bounds that; past it the visit
  // renders fresh, costing that one visitor a server render (the card
  // page's is one card and one author read). An hour would make the landing
  // page (revalidate 3600) block a visitor on every regeneration; at a day
  // it keeps regenerating in the background, and the profile's daily
  // backstop simply renders fresh once it is a day old.
  expireTime: 86400,

  // The policy pages read their Markdown from docs/legal (src/lib/legal).
  outputFileTracingIncludes: {
    '/[locale]/privacy': ['./docs/legal/**/*'],
    '/[locale]/terms': ['./docs/legal/**/*'],
    '/[locale]/support': ['./docs/legal/**/*'],
  },

  // ── Security headers on every response (see src/lib/api/securityHeaders) ──
  // No framing by other origins, no MIME sniffing, a short referrer, no
  // device access; the Content-Security-Policy is report-only for now.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env) }];
  },
};

export default withNextIntl(nextConfig);
