// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/../test/render';
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
  // Its segments are buttons, and like every button it is a filled shape: no
  // pen line round the bar (an outline marks a floating surface, a container
  // or an input), the tonal face under the segments that bring none, and the
  // seams between them cut in the paper's colour rather than drawn in ink.
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

  // Its segments draw no pen line, so a Tab-focused one needs a ring of its
  // own (the faint wash its focus grows is not enough), as every button has —
  // in the label's ink, which clears the segment's fill (cream on the verb's,
  // where the terracotta focus colour would vanish).
  it('rings a keyboard-focused segment in its label’s ink', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/molecules/SegmentedActionBar/SegmentedActionBar.module.css'),
      'utf8',
    );
    const [, body] = css.match(/\.seg:focus-visible\s*\{([^}]*)\}/) ?? [];
    expect(body).toMatch(/outline:\s*2px solid currentColor/);
    expect(body).toMatch(/outline-offset:\s*-\d+px/);
    render(<SegmentedActionBar segments={segments()} />);
    // The ring's ink is each segment's label colour.
    expect(screen.getByRole('button', { name: 'Resonate' }).style.color).toBe('var(--color-cream)');
  });

  // A segmented choice (the publish panel's visibility) says which side is chosen.
  it('tells a screen reader which side of a choice is chosen', () => {
    render(
      <SegmentedActionBar
        segments={[
          { key: 'public', label: 'Public', pressed: true },
          { key: 'private', label: 'Only me', pressed: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Only me' })).toHaveAttribute('aria-pressed', 'false');
    // An action bar's segments are plain buttons.
    render(<SegmentedActionBar segments={segments()} />);
    expect(screen.getByRole('button', { name: 'Leave a note' })).not.toHaveAttribute('aria-pressed');
  });

  describe('a collapsible segment', () => {
    // jsdom lays nothing out: the bar's container `room` px wide (a phone's
    // column), each segment 8px of padding a side and its words 10px a character.
    function layout(room: number) {
      const proto = HTMLElement.prototype;
      const roomRead = vi.spyOn(proto, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.querySelector(':scope > [role="group"]') ? room : 0;
      });
      const wordsRead = vi.spyOn(proto, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-label') ? (this.textContent ?? '').length * 10 : 0;
      });
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        (el: Element) =>
          ({
            paddingLeft: el.tagName === 'BUTTON' ? '8px' : '0px',
            paddingRight: el.tagName === 'BUTTON' ? '8px' : '0px',
            columnGap: '8px',
            getPropertyValue: () => '',
          }) as unknown as CSSStyleDeclaration,
      );
      /** How many times the room and the words have been weighed. */
      return () => roomRead.mock.calls.length + wordsRead.mock.calls.length;
    }
    afterEach(() => vi.restoreAllMocks());

    const collapsing = (bookmark = 'Bookmark'): SegmentSpec[] =>
      segments().map((s) => (s.key === 'bookmark' ? { ...s, label: bookmark, collapsible: true } : s));

    // 96 + 136 + 96 = 328px of words and padding.
    it('keeps its words while the row has room for every label', () => {
      layout(360);
      render(<SegmentedActionBar segments={collapsing()} />);
      expect(screen.getByRole('button', { name: 'Bookmark' })).not.toHaveAttribute('data-icon-only');
    });

    it('shows its icon alone when the row is too narrow, its words still its name', () => {
      layout(300);
      const { rerender } = render(<SegmentedActionBar segments={collapsing()} />);
      expect(screen.getByRole('button', { name: 'Bookmark' })).toHaveAttribute('data-icon-only');
      // Only the collapsible one gives way.
      expect(screen.getByRole('button', { name: 'Leave a note' })).not.toHaveAttribute('data-icon-only');
      // Shorter words that fit bring them back, though nothing the bar measures changed size.
      rerender(<SegmentedActionBar segments={collapsing('Save')} />);
      expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('data-icon-only');
    });

    // Every pointer move over the bar re-renders it (the hover wash follows
    // the pointer); weighing the room reads style and layout, so it waits for
    // a resize or new segments rather than running on each move.
    it('does not weigh the room again as the pointer moves over it', () => {
      const weighed = layout(300);
      const segs = collapsing();
      render(<SegmentedActionBar segments={segs} />);
      const before = weighed();
      expect(before).toBeGreaterThan(0);
      const note = screen.getByRole('button', { name: 'Leave a note' });
      fireEvent.mouseEnter(note, { clientX: 10, clientY: 10 });
      for (let x = 11; x < 21; x++) fireEvent.mouseMove(note, { clientX: x, clientY: 10 });
      fireEvent.mouseLeave(note);
      expect(weighed()).toBe(before);
    });
  });
});
