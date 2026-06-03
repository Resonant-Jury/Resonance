import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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
};

export default withNextIntl(nextConfig);
