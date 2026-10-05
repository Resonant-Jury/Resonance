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

  it('counts the read time as the stored summaries do (lib/readTime): CJK by the character, the rest by the word', () => {
    // Short story → clamps up to the 1-minute floor.
    expect(cardToStory(makeCard({ story: 'tiny' }), author).readTime).toBe('1 min');

    // 640 Chinese characters at ~320 a minute → 2 minutes. Spaces must not count.
    expect(cardToStory(makeCard({ story: '雨停了 '.repeat(213) + '雨' }), author).readTime).toBe('2 min');

    // 460 English words at ~230 a minute → 2 minutes (counting their 3220 letters made 10).
    expect(cardToStory(makeCard({ story: 'quietly '.repeat(460) }), author).readTime).toBe('2 min');
  });

  it("shows a summary's stored read time over counting its story, which is only the excerpt", () => {
    const card = makeCard({ story: 'The first lines…', summary: { readMinutes: 6 } });
    expect(cardToStory(card, author).readTime).toBe('6 min');
  });

  it('keeps short stories intact and collapses newlines in the excerpt', () => {
    const story = cardToStory(
      makeCard({ story: 'line one\n\nline two' }),
      author
    );
    expect(story.excerpt).toBe('line one line two');
  });

  // A whole story's excerpt is the one a list's summary would store (lib/markdown/plainText): prose, no
  // Markdown, no bare address — what a signed-out reader's story card shows matches a signed-in one's.
  it("shows a whole story's prose as the stored summaries do: no Markdown, no bare addresses", () => {
    const card = makeCard({
      story: '## 雨後\n\n我很喜歡 https://example.com，因為它很**好**。\n\nhttps://en.wikipedia.org/wiki/Jiufen_(town)\n\n寫信到 foo@www.example.com',
    });
    expect(cardToStory(card, author).excerpt).toBe('雨後 我很喜歡，因為它很好。 寫信到 foo@www.example.com');
  });

  it("shows a summary's excerpt as the server made it", () => {
    const card = makeCard({ story: 'The first lines, as stored…', summary: { readMinutes: 2 } });
    expect(cardToStory(card, author).excerpt).toBe('The first lines, as stored…');
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

  it('carries the cover-image accentHue through to the Story (and omits it when absent)', () => {
    expect(cardToStory(makeCard({ accentHue: 215 }), author).accentHue).toBe(215);
    expect(cardToStory(makeCard(), author).accentHue).toBeUndefined();
  });

  it('replaces the byline on anonymous cards — nothing identifying survives', () => {
    const story = cardToStory(makeCard({ anonymous: true }), author, {
      anonymousLabel: 'Anonymous',
    });
    expect(story.author).toBe('Anonymous');
    expect(story.authorInitials).toBe('·');
    expect(story.avatarUrl).toBeUndefined();
    // Avatar wobble seed derives from the card, not the author.
    expect(story.avatarSeed).not.toBe(author.avatarSeed);
    // Content itself is untouched.
    expect(story.title).toBe('A small kindness');
  });

  it('keeps the real byline on anonymous cards only when explicitly deanonymized (owner card box)', () => {
    const story = cardToStory(makeCard({ anonymous: true }), author, {
      anonymousLabel: 'Anonymous',
      deanonymize: true,
    });
    expect(story.author).toBe('mei');
    expect(story.avatarUrl).toBe('https://example.com/avatar.png');
  });
});

describe('plainExcerpt', () => {
  it('strips markdown syntax down to prose', () => {
    const md = '# Title\n\n> a quote\n\nSome **bold** and _light_ text with a [link](https://x.y) and ![img](https://x.y/i.png).\n\n```js\ncode();\n```';
    expect(plainExcerpt(md, 200)).toBe('Title a quote Some bold and light text with a link and .');
  });

  it('leaves bare addresses out, keeping the words and punctuation after them', () => {
    expect(plainExcerpt('他說「https://example.com/x」很好，見 <https://example.org> 與 www.example.net。', 200)).toBe(
      '他說「」很好，見 與。',
    );
  });

  it('truncates with an ellipsis at the limit', () => {
    expect(plainExcerpt('a'.repeat(100), 80)).toBe('a'.repeat(80) + '…');
    expect(plainExcerpt('short', 80)).toBe('short');
  });
});
