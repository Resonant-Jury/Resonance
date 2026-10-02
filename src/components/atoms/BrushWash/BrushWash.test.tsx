// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@/../test/render';
import { BrushWash } from './BrushWash';

const D = 'M 4,0 C 40,2 80,-1 116,0 C 120,10 121,30 116,40 C 80,42 40,39 4,40 C -1,30 0,10 4,0 Z';

/** The disc's radius on screen: its size times the scale it is grown to. */
function radius(disc: HTMLElement) {
  const scale = Number(disc.style.transform.match(/^scale\(([^)]+)\)$/)?.[1]);
  return (parseFloat(disc.style.width) / 2) * scale;
}

function wash(props: Partial<Parameters<typeof BrushWash>[0]> = {}) {
  const view = render(
    <BrushWash w={120} h={40} d={D} color="oklch(0% 0 0 / 0.14)" x={10} y={10} on={false} duration={340} overshoot={4} {...props} />,
  );
  const region = view.container.querySelector('[data-brush-wash]') as HTMLElement;
  return { ...view, region, disc: region?.firstElementChild as HTMLElement };
}

describe('BrushWash', () => {
  it('draws nothing until the shape is measured', () => {
    expect(wash({ w: 0, h: 0 }).region).toBeNull();
    expect(wash({ d: '' }).region).toBeNull();
  });

  it('stays inside the shape: its outline is the clip', () => {
    const { region } = wash();
    expect(region.style.clipPath).toBe(`path('${D}')`);
    expect(region.style.width).toBe('120px');
    expect(region.style.height).toBe('40px');
  });

  it('spreads from the pointer to just past the far corner, and withdraws to nothing', () => {
    const { disc, rerender } = wash();
    expect(radius(disc)).toBe(0);

    rerender(<BrushWash w={120} h={40} d={D} color="red" x={10} y={10} on duration={340} overshoot={4} />);
    // Centred on the pointer …
    expect(parseFloat(disc.style.left) + parseFloat(disc.style.width) / 2).toBe(10);
    expect(parseFloat(disc.style.top) + parseFloat(disc.style.height) / 2).toBe(10);
    // … reaching the far corner (110, 30 away) and the overshoot.
    expect(radius(disc)).toBeCloseTo(Math.hypot(110, 30) + 4, 6);
    expect(disc.style.background).toBe('red');

    // Leaving elsewhere: it withdraws toward where the pointer left, from the
    // size it had (the disc's own size never changes, only its scale).
    const size = disc.style.width;
    rerender(<BrushWash w={120} h={40} d={D} color="red" x={100} y={35} on={false} duration={340} overshoot={4} />);
    expect(radius(disc)).toBe(0);
    expect(disc.style.width).toBe(size);
    expect(parseFloat(disc.style.left) + parseFloat(disc.style.width) / 2).toBe(100);
  });

  // Grown as an SVG mask's radius, every frame of the spread repainted the
  // whole shape — a card's chalk and grain filters included. A transform runs
  // on the compositor.
  it('spreads by transform over the given time, linearly', () => {
    const { disc } = wash({ on: true, duration: 460 });
    expect(disc.style.transitionDuration).toBe('460ms');

    const css = readFileSync(join(process.cwd(), 'src/components/atoms/BrushWash/BrushWash.module.css'), 'utf8');
    const [, rule] = css.match(/\.ink\s*\{([^}]*)\}/) ?? [];
    expect(rule).toMatch(/transition-property:\s*transform;/);
    expect(rule).toMatch(/transition-timing-function:\s*linear;/);
    expect(rule).toMatch(/border-radius:\s*50%/);
  });
});
