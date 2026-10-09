import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// public/download-qr.svg, made once by scripts/web/download-qr.swift (macOS
// Core Image's QR encoder). Its content can't be read back without a decoder;
// this holds the picture to the shape a scanner needs.
const svg = readFileSync(join(__dirname, '../../../../public/download-qr.svg'), 'utf8');

function modules() {
  const side = Number(svg.match(/viewBox="0 0 (\d+) \1"/)![1]);
  const dark = Array.from({ length: side }, () => Array<boolean>(side).fill(false));
  const d = svg.match(/<path fill="[^"]+" d="([^"]+)"/)![1];
  for (const [, x, y, run] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let i = 0; i < Number(run); i++) dark[Number(y)][Number(x) + i] = true;
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

  it('has its three finder patterns where a scanner looks for them', () => {
    const { side, dark } = modules();
    const finder = (top: number, left: number) =>
      Array.from({ length: 7 }, (_, y) =>
        Array.from({ length: 7 }, (_, x) => (dark[top + y][left + x] ? '#' : '.')).join(''),
      ).join('\n');
    const pattern = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'].join('\n');
    const far = side - 4 - 7;
    expect(finder(4, 4)).toBe(pattern);
    expect(finder(4, far)).toBe(pattern);
    expect(finder(far, 4)).toBe(pattern);
    expect(finder(far, far)).not.toBe(pattern);
  });
});
