import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { INK_STRONG } from '@/lib/design/strokes';
import { SendIcon } from './send';

// The send glyph is drawn to sit optically centred, so the send buttons on all three platforms
// (which take it through scripts/apps/icons.ts) centre it with no offset of their own.

type Pt = [number, number];

/** The absolute M/L/C/Z path the apps can draw, flattened to points (32 per curve). */
function flatten(d: string): Pt[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let op = '';
  let cur: Pt = [0, 0];
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) op = tokens[i++];
    if (op === 'M' || op === 'L') {
      cur = [num(), num()];
      pts.push(cur);
      if (op === 'M') op = 'L';
    } else if (op === 'C') {
      const [p0, c1, c2, p1]: Pt[] = [cur, [num(), num()], [num(), num()], [num(), num()]];
      for (let s = 1; s <= 32; s++) {
        const t = s / 32;
        const u = 1 - t;
        const at = (k: 0 | 1) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p1[k];
        pts.push([at(0), at(1)]);
      }
      cur = p1;
    } else if (op === 'Z') {
      op = '';
    } else {
      throw new Error(`path command "${op}": the apps draw only absolute M/L/C/Z`);
    }
  }
  return pts;
}

/** The area centroid of the outline the points trace (closed back to its start). */
function centroid(poly: Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  poly.forEach(([x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  });
  return [cx / (3 * area), cy / (3 * area)];
}

const distanceTo = (p: Pt, line: Pt[]) => Math.min(...line.map(([x, y]) => Math.hypot(x - p[0], y - p[1])));

function sendGlyph() {
  const markup = renderToStaticMarkup(createElement(SendIcon, { size: 24 }));
  const [body, fold, ...rest] = [...markup.matchAll(/<path d="([^"]+)"/g)].map((m) => flatten(m[1]));
  return { markup, body, fold, rest };
}

describe('the send glyph', () => {
  it('is a body and a fold, on the 24-unit grid the other icons use', () => {
    const { markup, body, fold, rest } = sendGlyph();
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(body.length).toBeGreaterThan(32);
    expect(fold.length).toBeGreaterThan(1);
    expect(rest).toEqual([]);
  });

  it('sits optically centred: halfway between its ink box and the body’s centre of mass is (12, 12)', () => {
    const { body, fold } = sendGlyph();
    const ink = [...body, ...fold];
    const xs = ink.map(([x]) => x);
    const ys = ink.map(([, y]) => y);
    const box: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const mass = centroid(body);
    const optical: Pt = [(box[0] + mass[0]) / 2, (box[1] + mass[1]) / 2];
    expect(Math.hypot(optical[0] - 12, optical[1] - 12)).toBeLessThanOrEqual(0.3);
  });

  it('keeps the heaviest pen inside its box', () => {
    const { body, fold } = sendGlyph();
    const margin = INK_STRONG / 2;
    for (const [x, y] of [...body, ...fold]) {
      expect(x - margin).toBeGreaterThanOrEqual(0);
      expect(y - margin).toBeGreaterThanOrEqual(0);
      expect(x + margin).toBeLessThanOrEqual(24);
      expect(y + margin).toBeLessThanOrEqual(24);
    }
  });

  it('flicks the fold from the nose and lifts the pen before it reaches the fold, leaving a gap at every weight', () => {
    const { body, fold } = sendGlyph();
    // starts on the body, by the nose (the body's rightmost reach)…
    const nose = body.reduce((a, b) => (b[0] > a[0] ? b : a));
    expect(Math.hypot(fold[0][0] - nose[0], fold[0][1] - nose[1])).toBeLessThan(1);
    // …and ends clear of it: further from the outline than two half-strokes of the heaviest pen.
    expect(distanceTo(fold.at(-1)!, body)).toBeGreaterThan(INK_STRONG);
  });
});
