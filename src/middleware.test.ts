import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from './middleware';

// Which requests go through the locale middleware. The files crawlers and
// browsers ask for at the root must not: /robots.txt and /sitemap.xml are
// answered by src/app/robots.ts and sitemap.ts, /favicon.ico by public/ —
// anything else there falls to [locale] and is that segment's 404.

const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe('the middleware matcher', () => {
  it('leaves the root files, the API and Next’s own assets alone', () => {
    for (const path of [
      '/robots.txt',
      '/sitemap.xml',
      '/favicon.ico',
      '/favicon.png',
      '/manifest.webmanifest',
      '/og-cover.jpg',
      '/api/v1/feed',
      '/api/og/card/c1',
      '/_next/static/chunks/main.js',
    ]) {
      expect(runs(path), path).toBe(false);
    }
  });

  it('runs for the pages, with or without a locale', () => {
    for (const path of ['/', '/en', '/zh-TW', '/zh-TW/card/a-quiet-turning-point', '/en/me', '/home', '/card/a-quiet-turning-point']) {
      expect(runs(path), path).toBe(true);
    }
  });

  it('has a favicon.ico to serve (an icon, not a page)', () => {
    const ico = readFileSync(join(__dirname, '../public/favicon.ico'));
    // ICONDIR: reserved 0, type 1 (icon), at least one image.
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });
});
