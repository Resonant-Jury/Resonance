// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import { StoryCard, type Story } from './StoryCard';

// The card and its pills draw only once measured.
mockElementSize(320, 480);

const story: Story = {
  title: 'A quiet realization',
  excerpt: 'It came slowly.',
  author: 'friend',
  authorInitials: 'FR',
  readTime: '3 min',
  tags: ['tea', 'rest'],
};

/** `oklch(92% 0.075 88)` → [92, '0.075 88']: the lightness, and the rest of the colour. */
function lightness(fill: string | null) {
  const m = fill?.match(/^oklch\((\d+)% (.+)\)$/);
  if (!m) throw new Error(`not an oklch fill: ${fill}`);
  return [Number(m[1]), m[2]] as const;
}

describe('StoryCard tags', () => {
  // The pills carry no outline, and on desktop hover the card's interior washes
  // to close to the card's accent fill — a pill in that exact fill would vanish.
  // So each is filled a few points deeper, in the same colour family.
  it.each([0, 1, 2, 3, 4, 5])('fills the tags deeper than the card accent (palette %i)', (index) => {
    const { container } = render(<StoryCard story={story} index={index} />);

    // The cover placeholder is painted in the card's accent fill.
    const [accentL, accentRest] = lightness(container.querySelector('svg rect')?.getAttribute('fill') ?? null);

    for (const tag of ['tea', 'rest']) {
      const pill = screen.getByText(tag).parentElement as HTMLElement;
      const fill = pill.querySelector(':scope > svg path[fill]')?.getAttribute('fill') ?? null;
      const [tagL, tagRest] = lightness(fill);
      expect(tagL).toBe(accentL - 5);
      expect(tagRest).toBe(accentRest);
    }
  });
});
