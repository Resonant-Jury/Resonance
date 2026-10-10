import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// public/download-qr.svg, made once by scripts/web/download-qr.swift (macOS
// Core Image's QR encoder). Its content can't be read back without a decoder;
// this holds the picture to the shape a scanner needs. Its corners are rounded
// (the site's organic look), never past a module's own cell.
const svg = readFileSync(join(__dirname, '../../../../public/download-qr.svg'), 'utf8');

function modules() {
  const side = Number(svg.match(/viewBox="0 0 (\d+) \1"/)![1]);
  const dark = Array.from({ length: side }, () => Array<boolean>(side).fill(false));
  const d = svg.match(/<path fill="[^"]+" d="([^"]+)"/)![1];
  // Each row's run of dark modules is one subpath, its free corners rounded inside its cells:
  // it starts on its top edge (x0 + a corner's radius) and its first H ends there (x1 + 1 − one).
  const runs = [...d.matchAll(/M([\d.]+) (\d+)H([\d.]+)/g)];
  expect(runs.length).toBe(d.split('z').length - 1);
  for (const [, from, y, to] of runs) {
    for (let x = Math.floor(Number(from)); x < Math.ceil(Number(to)); x++) dark[Number(y)][x] = true;
  }
  return { side, dark };
}

describe('the download QR code', () => {
  it('is for the /download link', () => {
    expect(svg).toContain('data-content="https://resonance.channel/download"');
  });

  it('is a whole QR symbol inside the four-module quiet zone, dark on light', () => {
    const { side, dark } = modules();
    const size = side - 8;
    expect((size - 17) % 4).toBe(0); // 21, 25, 29 … modules: a QR version
    for (let i = 0; i < side; i++) {
      for (let q = 0; q < 4; q++) {
        expect(dark[q][i] || dark[side - 1 - q][i] || dark[i][q] || dark[i][side - 1 - q]).toBe(false);
      }
    }
    expect(svg).toMatch(/<rect width="\d+" height="\d+" fill="#faf6ef"\/>/);
    expect(svg).toMatch(/<path fill="#2f2115"/);
  });

  it('has its three finder patterns where a scanner looks for them, drawn whole with round corners', () => {
    const { side, dark } = modules();
    const far = side - 4 - 7;
    // The modules' path leaves the three 7 × 7 corners to the finders' own…
    for (const [top, left] of [[4, 4], [4, far], [far, 4]]) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) expect(dark[top + y][left + x]).toBe(false);
    }
    // …and the fourth corner is data, no finder.
    expect(dark.slice(far, far + 7).some((row) => row.slice(far, far + 7).includes(true))).toBe(true);
    // Each finder: a 7-module ring round a 5-module hole (even-odd) round a 3-module centre, 1 : 1 : 3 : 1 : 1.
    const d = svg.match(/<path fill-rule="evenodd" fill="#2f2115" data-finders="" d="([^"]+)"\/>/)![1];
    const squares = [...d.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)a([\d.]+)/g)].map(([, x, y, h, r]) => {
      const radius = Number(r);
      return { left: Number(x) - radius, top: Number(y), side: Number(h) + 2 * radius, radius };
    });
    const expected = [[4, 4], [far, 4], [4, far]].flatMap(([left, top]) => [
      { left, top, side: 7 },
      { left: left + 1, top: top + 1, side: 5 },
      { left: left + 2, top: top + 2, side: 3 },
    ]);
    expect(squares.map(({ left, top, side }) => ({ left, top, side }))).toEqual(expected);
    // Round-cornered, never so round a square stops reading as one.
    for (const sq of squares) {
      expect(sq.radius).toBeGreaterThan(0);
      expect(sq.radius).toBeLessThan(sq.side / 2);
    }
  });
});
