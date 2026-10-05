// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import { SegmentedActionBar, type SegmentSpec } from './SegmentedActionBar';

// The bar measures itself and its segments before it draws.
mockElementSize(120, 44);

const segments = (onNote = vi.fn()): SegmentSpec[] => [
  { key: 'resonate', label: 'Resonate', fill: 'var(--button-fill)', textColor: 'var(--color-cream)' },
  { key: 'note', label: 'Leave a note', onClick: onNote },
  { key: 'bookmark', label: 'Bookmark' },
];

const bar = () => screen.getByRole('group');

describe('SegmentedActionBar', () => {
  // Like every button it is a filled shape: no pen line round the bar, the
  // tonal face under the segments that bring none, and the seams between them
  // cut in the paper's colour rather than drawn in ink.
  it('draws no pen outline, only its tonal face and paper seams', () => {
    render(<SegmentedActionBar segments={segments()} />);
    const lines = penLines(bar());
    expect(lines.length).toBe(2);
    for (const seam of lines) expect(seam.getAttribute('stroke')).toBe('var(--color-cream)');
    const fills = Array.from(bar().querySelectorAll('svg path')).map((p) => p.getAttribute('fill'));
    expect(fills).toContain('var(--button-tonal)');
    expect(fills).toContain('var(--button-fill)');
  });

  it('labels a segment without a colour of its own in the deep terracotta', () => {
    render(<SegmentedActionBar segments={segments()} />);
    expect(screen.getByRole('button', { name: 'Leave a note' }).style.color).toBe('var(--button-on-tonal)');
    expect(screen.getByRole('button', { name: 'Resonate' }).style.color).toBe('var(--color-cream)');
  });

  it('still draws an outline when a caller asks for one', () => {
    render(<SegmentedActionBar segments={segments()} stroke="var(--field-border)" />);
    const strokes = penLines(bar()).map((p) => p.getAttribute('stroke'));
    expect(strokes).toContain('var(--field-border)');
  });

  it('takes clicks per segment', async () => {
    const onNote = vi.fn();
    render(<SegmentedActionBar segments={segments(onNote)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Leave a note' }));
    expect(onNote).toHaveBeenCalledTimes(1);
  });
});
