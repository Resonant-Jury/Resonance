import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetadataRoute } from 'next';
import { resolveRobots } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data';
import robots from './robots';

// /robots.txt as a crawler reads it: each path below is judged the way
// Google does — the longest matching rule wins, Allow on a tie.

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function crawlable(txt: MetadataRoute.Robots, path: string): boolean {
  const rules = Array.isArray(txt.rules) ? txt.rules : [txt.rules];
  const forAll = rules.filter((r) => list(r.userAgent).includes('*'));
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith('$');
    const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
  };
  let best = { length: -1, allow: true };
  for (const rule of forAll) {
    for (const [patterns, allow] of [[list(rule.allow), true], [list(rule.disallow), false]] as const) {
      for (const p of patterns) {
        if (!matches(p)) continue;
        if (p.length > best.length || (p.length === best.length && allow)) best = { length: p.length, allow };
      }
    }
  }
  return best.allow;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/robots.txt in production', () => {
  const production = () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance.channel');
    return robots();
  };

  it('opens the public pages: the landing page, cards, profiles, the policies, share images', () => {
    const txt = production();
    for (const path of [
      '/',
      '/en',
      '/zh-TW',
      '/en/card/a-quiet-turning-point',
      '/zh-TW/card/a-quiet-turning-point',
      '/en/u/alice',
      '/zh-TW/u/%E5%B0%8F%E6%98%8E',
      '/en/privacy',
      '/zh-TW/terms',
      '/en/support',
      '/zh-TW/child-safety',
      '/api/og/card/c1?v=2',
      '/api/og/user/alice',
      '/sitemap.xml',
    ]) {
      expect(crawlable(txt, path), path).toBe(true);
    }
  });

  it('closes the API and the signed-in app, in every locale', () => {
    const txt = production();
    for (const path of [
      '/api/v1/feed',
      '/api/cards/latest',
      '/api/auth/session',
      '/api/v1/cards/c1/og',
      '/en/home',
      '/zh-TW/home',
      '/en/me',
      '/zh-TW/me/thought-map',
      '/en/settings',
      '/zh-TW/messages',
      '/en/messages/bob',
      '/en/write',
      '/zh-TW/write/draft-1',
    ]) {
      expect(crawlable(txt, path), path).toBe(false);
    }
  });

  it('points at the sitemap on the site\'s own origin', () => {
    const text = resolveRobots(production());
    expect(text).toContain('User-Agent: *\n');
    expect(text).toContain('Disallow: /api/\n');
    expect(text.trimEnd().split('\n').at(-1)).toBe('Sitemap: https://resonance.channel/sitemap.xml');
  });
});

describe('/robots.txt anywhere else', () => {
  it.each([['preview'], ['development'], [undefined]])('turns every crawler away (VERCEL_ENV=%s), and names no sitemap', (env) => {
    vi.stubEnv('VERCEL_ENV', env);
    const txt = robots();
    for (const path of ['/', '/en', '/en/card/a-quiet-turning-point', '/en/u/alice', '/en/privacy', '/api/og/card/c1']) {
      expect(crawlable(txt, path), path).toBe(false);
    }
    expect(txt.sitemap).toBeUndefined();
    expect(resolveRobots(txt)).toBe('User-Agent: *\nDisallow: /\n\n');
  });
});
