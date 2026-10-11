// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@/../test/render';
import { penLines } from '@/../test/organic';
import { INK_LIGHT } from '@/lib/design/strokes';
import { AuthCard, SIDE_EDGE_TURNS, TOP_EDGE_TURNS, edgeTurnPx, edgeTurns } from './AuthCard';

function serverHtml(ui: React.ReactElement) {
  const host = document.createElement('div');
  host.innerHTML = renderToString(ui);
  return host;
}

describe('AuthCard', () => {
  it('goes straight from the title to the buttons', () => {
    render(
      <AuthCard title="Welcome back">
        <button type="button">Continue</button>
      </AuthCard>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Welcome back' });
    expect(title.nextElementSibling).toHaveTextContent('Continue');
  });

  it('goes straight from the title to the form', () => {
    render(
      <AuthCard title="Create your account">
        <label>
          Pen name <input />
        </label>
      </AuthCard>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Create your account' });
    expect(title.nextElementSibling).toContainElement(screen.getByLabelText('Pen name'));
  });
});

// Stacked (a phone, an upright tablet) the sheet sits at the foot of the
// screen: its paper under one wavy pen line, and no rule below. Side by side
// its left edge is the line. Either line takes turns by its length.
describe('the sheet', () => {
  // The design must be the first paint, scripts or none: an edge cannot wait
  // to measure the sheet, so every band of lengths has its own strip.
  it('has every top edge in the server HTML, one pen line and a curve per turn each', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const edges = Array.from(host.querySelectorAll('svg[data-turns]'));
    expect(edges.map((e) => Number(e.getAttribute('data-turns')))).toEqual(TOP_EDGE_TURNS);

    for (const edge of edges) {
      const [line] = penLines(edge);
      expect(penLines(edge)).toHaveLength(1);
      expect(line).toHaveAttribute('stroke-width', String(INK_LIGHT));
      expect(line.getAttribute('d')?.match(/C/g)).toHaveLength(Number(edge.getAttribute('data-turns')));
      // The sheet's paper starts at the line and nothing is painted above
      // it, so the cover's blobs go under the sheet exactly at its edge.
      expect(edge.querySelector('path[fill="var(--auth-interior)"]')).not.toBeNull();
      expect(edge.querySelector('path[fill="var(--color-cream)"]')).toBeNull();
    }
  });

  it('has every side edge in the server HTML too', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const sides = Array.from(host.querySelectorAll('svg[data-side-turns]'));
    expect(sides.map((e) => Number(e.getAttribute('data-side-turns')))).toEqual(SIDE_EDGE_TURNS);
    for (const side of sides) {
      expect(penLines(side)).toHaveLength(1);
      expect(penLines(side)[0].getAttribute('d')?.match(/C/g)).toHaveLength(Number(side.getAttribute('data-side-turns')));
      expect(side.querySelector('path[fill="var(--auth-interior)"]')).not.toBeNull();
      expect(side.querySelector('path[fill="var(--color-cream)"]')).toBeNull();
    }
  });

  it('draws nothing along its bottom', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const chrome = host.querySelector('svg[data-turns]')!.parentElement!.parentElement!;
    // The edges' strips and nothing else.
    expect(penLines(chrome)).toHaveLength(TOP_EDGE_TURNS.length + SIDE_EDGE_TURNS.length);
  });

  // A phone's line takes a few gentle waves, a desktop's many small ones: the
  // longer the line, the shorter each turn (and the more of them).
  it('takes shorter, more turns on a longer line', () => {
    expect(edgeTurns(375)).toBe(4);
    expect(edgeTurns(768)).toBe(10);
    expect(edgeTurns(900)).toBe(13);
    expect(edgeTurns(1080)).toBe(18);
    for (let length = 300; length < 1600; length += 10) {
      expect(edgeTurnPx(length + 10)).toBeLessThanOrEqual(edgeTurnPx(length));
      expect(edgeTurns(length + 10)).toBeGreaterThanOrEqual(edgeTurns(length));
    }
  });

  // jsdom applies no media queries, so read the stylesheet. Chrome matches a
  // media length within 1/64px either way (and lays out in 1/64px steps), so
  // at every such step exactly one strip must show under that tolerance — two
  // would draw two pen lines over each other — and under exact matching (as
  // other browsers do) never two. At whole pixels it is edgeTurns' own.
  const css = readFileSync(join(process.cwd(), 'src/components/molecules/AuthCard/AuthCard.module.css'), 'utf8');
  const bandsOf = (selector: RegExp, dim: 'width' | 'height') =>
    Array.from(
      css.matchAll(new RegExp(`@media ([^{]+)\\{\\s*${selector.source}\\s*\\{\\s*display:\\s*block;?\\s*\\}`, 'g')),
      ([, query, turns]) => ({
        turns: Number(turns),
        min: Number(query.match(new RegExp(`min-${dim}:\\s*([\\d.]+)px`))?.[1] ?? 0),
        max: Number(query.match(new RegExp(`max-${dim}:\\s*([\\d.]+)px`))?.[1] ?? Infinity),
      }),
    );
  const EPS = 1 / 64;
  const chromeShows = (bands: ReturnType<typeof bandsOf>, at: number) =>
    bands.filter((b) => at + EPS >= b.min && at <= b.max + EPS).map((b) => b.turns);
  const exactShows = (bands: ReturnType<typeof bandsOf>, at: number) =>
    bands.filter((b) => at >= b.min && at <= b.max).map((b) => b.turns);

  const checkBands = (bands: ReturnType<typeof bandsOf>, from: number, to: number, expected: (at: number) => number) => {
    for (let step = from * 64; step <= to * 64; step++) {
      const at = step / 64;
      const shown = chromeShows(bands, at);
      expect(shown, `${at}px`).toHaveLength(1);
      expect(exactShows(bands, at).length, `${at}px`).toBeLessThanOrEqual(1);
      if (Number.isInteger(at)) expect(shown, `${at}px`).toEqual([expected(at)]);
    }
  };

  it('shows the top strip whose turns fit the width, one at every stacked width', () => {
    const bands = bandsOf(/\.edge\[data-turns='(\d+)'\]/, 'width');
    expect(bands.map((b) => b.turns).sort((a, b) => a - b)).toEqual(TOP_EDGE_TURNS);
    checkBands(bands, 280, 1024, edgeTurns);
  });

  it('shows the side strip whose turns fit the height, one at every height', () => {
    const bands = bandsOf(/\.side\[data-side-turns='(\d+)'\]/, 'height');
    expect(bands.map((b) => b.turns).sort((a, b) => a - b)).toEqual(SIDE_EDGE_TURNS);
    checkBands(bands, 300, 2000, (at) => edgeTurns(Math.min(at, 1440)));
  });

  // The sheet's paper begins at its pen line and nothing of it lies before:
  // each strip's paper runs from the line to the strip's far side (the top
  // strip's bottom, the side strip's right), and the paper box under the
  // strip starts within it — past the line's deepest wobble — so the two meet
  // with no gap, and the cover's blobs go under the sheet at the line itself.
  it('lays its paper from the pen line inward, never before it', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const numbers = (d: string) => (d.match(/-?[\d.]+/g) ?? []).map(Number);
    const paperInset = Number(css.match(/\.paper \{[^}]*inset: 0 0 0 (\d+)px/)?.[1]);
    expect(paperInset).toBeGreaterThan(0);

    for (const edge of Array.from(host.querySelectorAll('svg[data-turns]'))) {
      const paper = edge.querySelector('path[fill="var(--auth-interior)"]')!.getAttribute('d')!;
      const line = penLines(edge)[0].getAttribute('d')!;
      // The paper is the line closed off below it.
      expect(paper.startsWith(line)).toBe(true);
      expect(paper.slice(line.length)).toMatch(/^ L [\d.]+,15 L 0,15 Z$/);
      // The line's y values (every second number) stay above where the box begins.
      const ys = numbers(line).filter((_, i) => i % 2 === 1);
      expect(Math.max(...ys)).toBeLessThan(paperInset);
      expect(Math.min(...ys)).toBeGreaterThan(0);
    }
    for (const side of Array.from(host.querySelectorAll('svg[data-side-turns]'))) {
      const paper = side.querySelector('path[fill="var(--auth-interior)"]')!.getAttribute('d')!;
      const line = penLines(side)[0].getAttribute('d')!;
      expect(paper.startsWith(line)).toBe(true);
      expect(paper.slice(line.length)).toMatch(/^ L 15,[\d.]+ L 15,0 Z$/);
      const xs = numbers(line).filter((_, i) => i % 2 === 0);
      expect(Math.max(...xs)).toBeLessThan(paperInset);
      expect(Math.min(...xs)).toBeGreaterThan(0);
    }
  });

  // Every strip's paper wears the sheet's grain through one shared filter (in
  // an SVG that renders, so the filter paints), not a filter per strip.
  it('grains every strip through one shared filter', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const papers = Array.from(host.querySelectorAll('path[fill="var(--auth-interior)"]'));
    expect(papers).toHaveLength(TOP_EDGE_TURNS.length + SIDE_EDGE_TURNS.length);
    const refs = new Set(papers.map((p) => p.getAttribute('filter')));
    expect(refs.size).toBe(1);
    const id = [...refs][0]!.match(/^url\(#(.+)\)$/)![1];
    // Defined once, and not inside a strip (which may be display:none).
    expect(host.querySelectorAll(`filter[id="${id}"]`)).toHaveLength(1);
    expect(host.querySelector(`filter[id="${id}"]`)!.closest('svg[data-turns], svg[data-side-turns]')).toBeNull();
    // The paper box's GrainOverlay and this one: no filter per strip.
    expect(host.querySelectorAll('filter')).toHaveLength(2);
    expect(host.querySelector('clipPath')).toBeNull();
    // The grain is laid over the paper in sRGB, as GrainOverlay's opacity
    // lays its own: blended in a filter's default linearRGB, it darkens a
    // light paper far less, and the strip reads as a lighter band.
    const filter = host.querySelector(`filter[id="${id}"]`)!;
    const merge = filter.querySelector('feMerge, femerge')!;
    expect(merge).toHaveAttribute('color-interpolation-filters', 'sRGB');
    const nodes = Array.from(merge.querySelectorAll('feMergeNode, femergenode'));
    expect(nodes.map((n) => n.getAttribute('in'))).toEqual(['SourceGraphic', 'grain']);
    expect(filter.querySelector('[result="grain"]')).not.toBeNull();
  });
});
