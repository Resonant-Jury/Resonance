import { describe, it, expect } from 'vitest';
import { cardToStory, plainExcerpt } from './story';
import type { Card, User } from '@/lib/db/types';

// Builds a Card with sensible defaults; tests override only the fields they
// care about so each assertion reads as the rule it exercises.
function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    authorId: 'u1',
    thoughtCore: 'A small kindness',
    story: 'Once upon a time there was a quiet street.',
    tags: ['life', 'kindness'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...overrides,
  };
}

const author: Pick<User, 'handle' | 'initials' | 'avatarUrl' | 'avatarSeed'> = {
  handle: 'mei',
  initials: 'M',
  avatarUrl: 'https://example.com/avatar.png',
  avatarSeed: '123',
};

describe('cardToStory', () => {
  it('maps core Card fields onto the Story shape the UI expects', () => {
    const story = cardToStory(makeCard(), author);
    expect(story.title).toBe('A small kindness');
    expect(story.author).toBe('mei');
    expect(story.authorInitials).toBe('M');
    expect(story.avatarUrl).toBe('https://example.com/avatar.png');
    expect(story.avatarSeed).toBe('123');
    expect(story.tags).toEqual(['life', 'kindness']);
  });

  it('derives read time from non-whitespace character count (~320 chars/min, floor of 1)', () => {
    // Short story → clamps up to the 1-minute floor.
    expect(cardToStory(makeCard({ story: 'tiny' }), author).readTime).toBe('1 min');

    // ~640 non-whitespace chars → 2 minutes. Spaces must not count.
    const long = 'x '.repeat(640); // 640 'x' + 640 spaces
    expect(cardToStory(makeCard({ story: long }), author).readTime).toBe('2 min');
  });

  it('keeps short stories intact and collapses newlines in the excerpt', () => {
    const story = cardToStory(
      makeCard({ story: 'line one\n\nline two' }),
      author
    );
    expect(story.excerpt).toBe('line one line two');
  });

  it('truncates long stories to 96 chars with an ellipsis', () => {
    const story = cardToStory(makeCard({ story: 'a'.repeat(200) }), author);
    expect(story.excerpt).toBe('a'.repeat(96) + '…');
    expect(story.excerpt.endsWith('…')).toBe(true);
  });

  it('passes media url through and falls back the label to a slice of thoughtCore', () => {
    const withMedia = cardToStory(
      makeCard({ media: { type: 'image', url: 'https://cdn/x.jpg', label: 'Sunset' } }),
      author
    );
    expect(withMedia.imageUrl).toBe('https://cdn/x.jpg');
    expect(withMedia.imageLabel).toBe('Sunset');

    const noLabel = cardToStory(
      makeCard({
        thoughtCore: 'A very long thought core that exceeds the slice',
        media: { type: 'image', url: 'https://cdn/y.jpg' },
      }),
      author
    );
    expect(noLabel.imageLabel).toBe('A very long thought core'); // first 24 chars
  });

  it('leaves imageUrl undefined when the card has no media', () => {
    expect(cardToStory(makeCard({ media: undefined }), author).imageUrl).toBeUndefined();
  });
});

describe('plainExcerpt', () => {
  it('strips markdown syntax down to prose', () => {
    const md = '# Title\n\n> a quote\n\nSome **bold** and _light_ text with a [link](https://x.y) and ![img](https://x.y/i.png).\n\n```js\ncode();\n```';
    expect(plainExcerpt(md, 200)).toBe('Title a quote Some bold and light text with a link and .');
  });

  it('truncates with an ellipsis at the limit', () => {
    expect(plainExcerpt('a'.repeat(100), 80)).toBe('a'.repeat(80) + '…');
    expect(plainExcerpt('short', 80)).toBe('short');
  });
});
