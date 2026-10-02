// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/../test/render';

// The outline itself is pure; count how often a shape redraws it.
vi.mock('@/lib/design/wobRect', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/design/wobRect')>();
  return { ...mod, wobRect: vi.fn(mod.wobRect) };
});

import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag } from '@/lib/design/wobAuto';
import { ChalkFilters, HandDrawnBorder } from './HandDrawnBorder';

describe('HandDrawnBorder', () => {
  // Hosts pass segment ranges inline (segmentsH={[3, 4]}), a new array on
  // every render: a card re-rendering on hover, say. The outline depends on
  // the values, so it is drawn once until one of them changes.
  it('draws its outline once while the shape stays the same', () => {
    const shape = (h: number) => (
      <HandDrawnBorder w={320} h={h} R={22} seed={13} fillColor="white" segmentsH={[3, 4]} segmentsV={[5, 6]} />
    );
    const { container, rerender } = render(shape(480));
    const d = container.querySelector('path')?.getAttribute('d');
    vi.mocked(wobRect).mockClear();

    rerender(shape(480));
    rerender(shape(480));
    expect(wobRect).not.toHaveBeenCalled();
    expect(container.querySelector('path')?.getAttribute('d')).toBe(d);

    rerender(shape(500));
    expect(wobRect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('path')?.getAttribute('d')).not.toBe(d);
  });

  it('draws exactly the outline it drew before (a range is still a range)', async () => {
    const { wobRect: draw } = await vi.importActual<typeof import('@/lib/design/wobRect')>('@/lib/design/wobRect');
    const { container } = render(
      <HandDrawnBorder w={320} h={480} R={22} seed={13} fillColor="white" segmentsH={[3, 4]} segmentsV={5} />,
    );
    expect(container.querySelector('path')?.getAttribute('d')).toBe(
      draw(320, 480, 22, 13, autoMag(320, 480), {
        segmentsH: [3, 4],
        segmentsV: 5,
        curve: autoCurve(320, 480),
        cornerJitter: 1,
        cornerOffset: 0,
      }),
    );
  });

  // The thought map draws a hundred cards with six chalk seeds: each card
  // refers to a filter defined once, the same filter it would define itself.
  it('can refer to a chalk defined once for the page', () => {
    const own = render(<HandDrawnBorder w={232} h={178} seed={7} fillColor="white" chalkSeed={3} />);
    const ownFilter = own.container.querySelector('filter')!.outerHTML;
    own.unmount();

    const { container } = render(
      <>
        <ChalkFilters seeds={[0, 1, 2, 3, 4, 5]} />
        <div data-testid="card">
          <HandDrawnBorder w={232} h={178} seed={7} fillColor="white" chalkSeed={3} sharedChalk />
        </div>
      </>,
    );
    const card = container.querySelector('[data-testid="card"]')!;
    expect(card.querySelector('filter')).toBeNull();
    expect(card.querySelector('path')).toHaveAttribute('filter', 'url(#chalk-hdb-3)');
    expect(container.querySelector('filter#chalk-hdb-3')!.outerHTML).toBe(ownFilter);
    // Defined in a zero-sized svg, not display: none, which would switch it off.
    const defs = container.querySelector('filter#chalk-hdb-3')!.closest('svg')!;
    expect(defs).toHaveAttribute('width', '0');
    expect(defs.style.display).not.toBe('none');
  });
});
