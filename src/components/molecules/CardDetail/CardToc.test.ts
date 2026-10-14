import { describe, expect, it } from 'vitest';
import { headingBeingRead } from './CardToc';

const tops = (...ys: number[]) => ys.map((top, i) => ({ id: `h${i + 1}`, top }));

describe('headingBeingRead', () => {
  it('is none until the first heading passes the reading line', () => {
    expect(headingBeingRead(tops(300, 900, 1500), 178, false, 800)).toBeNull();
  });

  it('is the last heading above the reading line', () => {
    expect(headingBeingRead(tops(-400, 120, 700), 178, false, 800)).toBe('h2');
    expect(headingBeingRead(tops(-900, -300, 178), 178, false, 800)).toBe('h3');
  });

  it('at the end of the page, is the last heading on screen (the closing sections never reach the line)', () => {
    expect(headingBeingRead(tops(-600, 100, 500, 760), 178, true, 800)).toBe('h4');
    expect(headingBeingRead(tops(-600, 100, 500, 900), 178, true, 800)).toBe('h3');
  });
});
