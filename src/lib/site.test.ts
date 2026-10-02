import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';

// The site moved from resonance-world.vercel.app to resonance.channel. The
// old host still serves the same deployment, and vercel.json sends people
// there — every page, permanently — but not /api, /_next or /.well-known:
// app builds already installed call the old host's API, and Android's App
// Links read its /.well-known. Widening the redirect would break those
// builds' requests (a client following a redirect to another origin may drop
// the Authorization header), so it is pinned here.

const OLD_HOST = 'resonance-world.vercel.app';
const vercel = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8')) as {
  redirects?: { source: string; destination: string; permanent?: boolean; statusCode?: number; has?: { type: string; key?: string; value?: unknown }[] }[];
};
const fromOldHost = (vercel.redirects ?? []).filter((r) => r.has?.some((h) => h.type === 'host' && h.value === OLD_HOST));

describe('the old host (vercel.json redirects)', () => {
  it('sends every page to the same path on resonance.channel, permanently — on the old host only', () => {
    expect(fromOldHost).toHaveLength(1);
    const [redirect] = fromOldHost;
    expect(redirect.has).toEqual([{ type: 'host', value: OLD_HOST }]);
    expect(redirect.destination).toBe('https://resonance.channel/:path*');
    expect(redirect.permanent).toBe(true);
    expect(redirect.statusCode).toBeUndefined();

    const match = getPathMatch(redirect.source);
    for (const [path, rest] of [
      ['/', ''],
      ['/zh-TW', 'zh-TW'],
      ['/en/card/a-quiet-turning-point', 'en/card/a-quiet-turning-point'],
      ['/zh-TW/messages/bob', 'zh-TW/messages/bob'],
      ['/u/someone', 'u/someone'],
      ['/og-cover.jpg', 'og-cover.jpg'],
      ['/apiary', 'apiary'],
    ]) {
      expect(match(path), path).toEqual({ path: rest });
    }
  });

  it('leaves /api, /_next and /.well-known answering on the old host, for the app builds already out there', () => {
    // Nor does any other redirect, on any host, take them.
    for (const redirect of vercel.redirects ?? []) {
      const match = getPathMatch(redirect.source);
      for (const path of [
        '/api',
        '/api/',
        '/api/v1/feed',
        '/api/v1/cards/abc/publish',
        '/api/auth/session',
        '/_next/static/chunks/main.js',
        '/_next/image',
        '/.well-known/assetlinks.json',
        '/.well-known/apple-app-site-association',
      ]) {
        expect(match(path), `${redirect.source}: ${path}`).toBe(false);
      }
    }
  });
});
