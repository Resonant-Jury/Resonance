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
  // A lone button is a filled shape with no pen line, but a segmented control
  // keeps its frame: the outline is what makes its options read as one
  // control, and the dividers between them are drawn in the same pen.
  it('draws its pen outline and inked dividers round the segments', () => {
    render(<SegmentedActionBar segments={segments()} />);
    const lines = penLines(bar());
    const PEN = 'color-mix(in oklch, var(--color-terracotta), black 12%)';
    // two dividers between three segments, and the outline round them all
    expect(lines.length).toBe(3);
    for (const line of lines) expect(line.getAttribute('stroke')).toBe(PEN);
    const fills = Array.from(bar().querySelectorAll('svg path')).map((p) => p.getAttribute('fill'));
    expect(fills).toContain('var(--button-fill)');
  });

  // Plain terracotta on the bar's paper is 3.5:1; the button tokens clear 4.5:1.
  it('labels a segment without a colour of its own in the deep terracotta', () => {
    render(<SegmentedActionBar segments={segments()} />);
    expect(screen.getByRole('button', { name: 'Leave a note' }).style.color).toBe('var(--button-on-tonal)');
    expect(screen.getByRole('button', { name: 'Resonate' }).style.color).toBe('var(--color-cream)');
  });

  it('takes a caller\'s pen colour', () => {
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
