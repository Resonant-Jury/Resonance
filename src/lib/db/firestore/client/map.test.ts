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
});
