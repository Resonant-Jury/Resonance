import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS, LEGACY_AVATAR_COLOR, avatarColorFor } from './avatarColors';

describe('avatarColorFor', () => {
  it('gives an account the same colour every time, from the palette', () => {
    for (const uid of ['alice', 'Zq3pX9aLmN0bVc7dEf1GhIjK2lM3', '']) {
      expect(AVATAR_COLORS).toContain(avatarColorFor(uid));
      expect(avatarColorFor(uid)).toBe(avatarColorFor(uid));
    }
  });

  it('spreads accounts over the whole palette, not one colour for all', () => {
    // Firebase uids are 28 characters of [A-Za-z0-9]: a run of made-up ones, each a character from the last.
    const uids = Array.from({ length: 140 }, (_, i) => `k3Jd9QxLmP0aZr7TbWc2Ns5Yv${String(i).padStart(3, '0')}`);
    const tally = AVATAR_COLORS.map((c) => uids.filter((u) => avatarColorFor(u) === c).length);
    // 20 each on average; no colour left out or taking half.
    expect(Math.min(...tally)).toBeGreaterThan(5);
    expect(Math.max(...tally)).toBeLessThan(45);
  });

  it('keeps the colour everyone wore before as one of the palette', () => {
    expect(AVATAR_COLORS).toContain(LEGACY_AVATAR_COLOR);
  });
});
