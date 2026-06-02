import { describe, it, expect } from 'vitest';
import { makePrng } from './prng';

// The whole organic-SVG identity relies on this PRNG being deterministic per
// seed — that's what keeps server-rendered and client-rendered shapes
// identical and avoids hydration mismatches.
describe('makePrng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = makePrng(42);
    const b = makePrng(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makePrng(1);
    const b = makePrng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays within the [0, 1) range', () => {
    const rnd = makePrng(7);
    for (let i = 0; i < 500; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
