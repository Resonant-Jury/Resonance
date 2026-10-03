import { describe, expect, it } from 'vitest';
import { mapCard } from './map';

const base = {
  authorId: 'u1',
  thoughtCore: 'core',
  story: 'story',
  tags: [],
  visibility: 'public',
};

describe('mapCard (client)', () => {
  it('keeps a numeric accentHue', () => {
    expect(mapCard('c1', { ...base, accentHue: 215 }).accentHue).toBe(215);
  });

  it('normalises a missing or null accentHue to undefined', () => {
    expect(mapCard('c1', base).accentHue).toBeUndefined();
    expect(mapCard('c1', { ...base, accentHue: null }).accentHue).toBeUndefined();
  });

  it("keeps the server's link previews a reader may draw, in order, and nothing else", () => {
    const linkPreviews = [
      { url: 'https://example.com/a', title: 'A', description: 'About a', siteName: 'Ex', image: '/api/link-image?u=x&s=y' },
      { url: 'javascript:alert(1)', title: 'Not a page' },
      { url: 'https://example.com/untitled' },
      { url: 'https://example.com/b', title: 'B', image: 'https://tracker.example/p.gif', extra: 'dropped' },
      'not an object',
    ];
    expect(mapCard('c1', { ...base, linkPreviews }).linkPreviews).toEqual([
      { url: 'https://example.com/a', title: 'A', description: 'About a', siteName: 'Ex', image: '/api/link-image?u=x&s=y' },
      { url: 'https://example.com/b', title: 'B' },
    ]);
    // None (or nothing usable) is no field at all.
    expect(mapCard('c1', base)).not.toHaveProperty('linkPreviews');
    expect(mapCard('c1', { ...base, linkPreviews: 'x' })).not.toHaveProperty('linkPreviews');
  });
});
