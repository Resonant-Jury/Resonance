// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/../test/render';
import { HandDrawnAvatar, initialsScale } from './HandDrawnAvatar';

// The initials keep paper between them and the outline: Latin ones at the usual 35 % of the
// avatar, two Chinese characters (each a full em wide) smaller, so they no longer meet its curve.
describe('the avatar’s initials', () => {
  it('keeps Latin initials and a single character at 35 %', () => {
    expect(initialsScale('AL')).toBe(0.35);
    expect(initialsScale('TE')).toBe(0.35);
    expect(initialsScale('念')).toBe(0.35);
  });

  it('draws two wide characters within 56 % of the avatar', () => {
    expect(initialsScale('念誠')).toBeCloseTo(0.28);
    expect(initialsScale('念誠') * 2).toBeLessThanOrEqual(0.56);
    expect(initialsScale('ㄅㄆ')).toBeCloseTo(0.28);
    expect(initialsScale('念A')).toBeCloseTo(0.56 / 1.62);
  });

  it('sizes the drawn letters by that rule', () => {
    render(<HandDrawnAvatar initials="念誠" size={40} />);
    expect(screen.getByText('念誠')).toHaveStyle({ fontSize: `${40 * initialsScale('念誠')}px` });
  });
});
