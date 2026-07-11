import { describe, expect, it } from 'vitest';
import { buildCardMetadata } from './og';
import type { Card, User } from '@/lib/db/types';

const baseCard: Card = {
  id: 'card1',
  authorId: 'user1',
  slug: 'a-quiet-turning-point',
  thoughtCore: 'A quiet turning point',
  story: '# Heading\n\nI **finally** understood why I kept running. See [notes](https://x.co).',
  tags: ['growth', 'family'],
  originalLocale: 'en',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-03-01T00:00:00.000Z'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
};

const author: User = {
  id: 'user1',
  handle: 'mira',
  region: 'Taipei',
  primaryLocale: 'en',
  autoTranslateTo: [],
  verified: true,
  phoneHash: '',
  avatarSeed: '7',
  initials: 'MI',
  accentColor: 'var(--color-terracotta)',
  joinedAt: new Date(),
  handleChangedAt: new Date(),
};

const base = 'https://resonance.example';

describe('buildCardMetadata', () => {
  it('uses the card title, a markdown-stripped excerpt, and the author byline', () => {
    const meta = buildCardMetadata({ card: baseCard, author, locale: 'en', base, anonymousLabel: 'Anonymous' });

    expect(meta.title).toBe('A quiet turning point');
    // Markdown syntax (#, **, links) stripped for the share description.
    expect(meta.description).toContain('I finally understood why I kept running');
    expect(meta.description).not.toContain('#');
    expect(meta.description).not.toContain('**');
    expect((meta.openGraph as { type?: string }).type).toBe('article');
    expect((meta.openGraph as { authors?: string[] }).authors).toEqual(['mira']);
    expect((meta.twitter as { card?: string }).card).toBe('summary_large_image');
    expect(meta.alternates?.canonical).toBe('https://resonance.example/en/card/a-quiet-turning-point');
  });

  it('uses the card image as the share thumbnail when present', () => {
    const card: Card = { ...baseCard, media: { type: 'image', url: 'https://cdn.r2.dev/pic.avif' } };
    const meta = buildCardMetadata({ card, author, locale: 'en', base, anonymousLabel: 'Anonymous' });
    expect((meta.openGraph?.images as { url: string }[])[0].url).toBe('https://cdn.r2.dev/pic.avif');
    expect((meta.twitter as { images?: string[] }).images).toEqual(['https://cdn.r2.dev/pic.avif']);
  });

  it('falls back to the platform cover when the card has no image', () => {
    const meta = buildCardMetadata({ card: baseCard, author, locale: 'en', base, anonymousLabel: 'Anonymous' });
    expect((meta.openGraph?.images as { url: string }[])[0].url).toBe('https://resonance.example/og-cover.jpg');
  });

  it('prefers the viewer-locale translation of title and story', () => {
    const card: Card = {
      ...baseCard,
      translations: {
        'zh-TW': { title: '安靜的轉捩點', thoughtCore: '安靜的轉捩點', story: '我終於明白為什麼一直在逃。', aiGenerated: true },
      },
    };
    const meta = buildCardMetadata({ card, author, locale: 'zh-TW', base, anonymousLabel: '匿名' });
    expect(meta.title).toBe('安靜的轉捩點');
    expect(meta.description).toContain('我終於明白');
  });

  it('hides the byline for anonymous cards', () => {
    const card: Card = { ...baseCard, anonymous: true };
    const meta = buildCardMetadata({ card, author, locale: 'en', base, anonymousLabel: 'Anonymous' });
    expect((meta.openGraph as { authors?: string[] }).authors).toBeUndefined();
  });
});
