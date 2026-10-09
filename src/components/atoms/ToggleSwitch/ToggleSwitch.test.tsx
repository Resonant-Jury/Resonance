// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { wobRect } from '@/lib/design/wobRect';
import { wobCircle } from '@/lib/design/wobCircle';
import { INK_LIGHT } from '@/lib/design/strokes';
import { TOGGLE, ToggleSwitch, toggleShapes } from './ToggleSwitch';

// The end point of every cubic in a wobRect path, in drawing order: for the
// switch's track (one turn per long edge, one cubic per short edge) the 2nd is
// the top edge's turn and the 7th the bottom edge's.
const cubicEnds = (d: string) => [...d.matchAll(/C \S+ \S+ ([-\d.]+),([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const edgeTurns = (d: string) => {
  const ends = cubicEnds(d);
  return { top: ends[1][1], bottom: ends[6][1] - TOGGLE.h };
};

describe('ToggleSwitch', () => {
  it('exposes switch semantics reflecting the checked prop', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} ariaLabel="Auto translate" />);
    const sw = screen.getByRole('switch', { name: 'Auto translate' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects the checked state through aria-checked', () => {
    render(<ToggleSwitch checked onChange={() => {}} ariaLabel="Auto translate" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when the user clicks it', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="Auto translate" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled, and points at the text that explains it', async () => {
    const onChange = vi.fn();
    render(
      <>
        <ToggleSwitch checked={false} onChange={onChange} ariaLabel="Evening card" describedBy="hint" disabled />
        <p id="hint">Up to three evenings a week</p>
      </>,
    );
    const sw = screen.getByRole('switch', { name: 'Evening card' });
    expect(sw).toBeDisabled();
    expect(sw).toHaveAccessibleDescription('Up to three evenings a week');
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inks its pill once, on the very path its well is filled to (paint and edge never part), and draws the knob from seed + 5', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} ariaLabel="Anonymous" seed={57} />);
    const sw = screen.getByRole('switch');
    const fill = sw.querySelector('path:not([stroke-width])')!;
    const lines = [...sw.querySelectorAll('path[stroke-width]')];
    const [pen, knob] = lines;
    const { w, h, radius, mag, track, knob: size, knobOpts } = TOGGLE;

    // The apps draw the same seeds: the track and its fill from the seed itself.
    expect(lines).toHaveLength(2);
    expect(fill.getAttribute('d')).toBe(wobRect(w, h, radius, 57, mag, track));
    expect(pen.getAttribute('d')).toBe(fill.getAttribute('d'));
    expect(pen).not.toHaveAttribute('stroke-opacity');
    expect(knob.getAttribute('d')).toBe(wobCircle(size / 2, size / 2, size / 2, 62, knobOpts));
    for (const line of lines) expect(line).toHaveAttribute('stroke-width', String(INK_LIGHT));
  });

  it('is the same drawing for the same seed (server and browser agree) and another for another seed', () => {
    const { container: a } = render(<ToggleSwitch checked onChange={() => {}} seed={91} />);
    const { container: b } = render(<ToggleSwitch checked onChange={() => {}} seed={91} />);
    const { container: c } = render(<ToggleSwitch checked onChange={() => {}} seed={83} />);
    const paths = (el: HTMLElement) => [...el.querySelectorAll('path[stroke-width]')].map((p) => p.getAttribute('d'));
    expect(paths(a)).toEqual(paths(b));
    expect(paths(c)).not.toEqual(paths(a));
  });

  it('bows each long edge by hand, in or out by up to 2.5px and never more — a visible wobble, not a stock pill or a peanut', () => {
    let widest = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { top, bottom } = edgeTurns(toggleShapes(seed).track);
      for (const turn of [top, bottom]) {
        expect(Math.abs(turn)).toBeLessThanOrEqual(2.52);
        widest = Math.max(widest, Math.abs(turn));
      }
    }
    expect(widest).toBeGreaterThan(2.3);
  });
});
