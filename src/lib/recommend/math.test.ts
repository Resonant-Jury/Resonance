import { describe, expect, it } from 'vitest';
import { dot, kmeans, mean, normalize } from './math';

describe('normalize', () => {
  it('produces a unit vector', () => {
    const n = normalize([3, 4]);
    expect(dot(n, n)).toBeCloseTo(1, 6);
  });
  it('leaves a zero vector unchanged', () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe('mean', () => {
  it('averages element-wise', () => {
    expect(mean([[1, 2], [3, 4]])).toEqual([2, 3]);
  });
});

describe('kmeans', () => {
  it('returns each point as its own centroid when points <= k', () => {
    const out = kmeans([normalize([1, 0]), normalize([0, 1])], 4);
    expect(out).toHaveLength(2);
  });

  it('separates two well-defined clusters', () => {
    // Two tight groups: near +x and near +y.
    const points = [
      normalize([1, 0.05]),
      normalize([1, -0.05]),
      normalize([0.98, 0.02]),
      normalize([0.05, 1]),
      normalize([-0.05, 1]),
      normalize([0.02, 0.98]),
    ];
    const centroids = kmeans(points, 2);
    expect(centroids).toHaveLength(2);
    // One centroid should align with +x, the other with +y.
    const alignsX = centroids.some((c) => dot(c, normalize([1, 0])) > 0.9);
    const alignsY = centroids.some((c) => dot(c, normalize([0, 1])) > 0.9);
    expect(alignsX).toBe(true);
    expect(alignsY).toBe(true);
  });

  it('is deterministic across runs (same input → same centroids)', () => {
    const points = Array.from({ length: 20 }, (_, i) => normalize([Math.cos(i), Math.sin(i)]));
    expect(kmeans(points, 3)).toEqual(kmeans(points, 3));
  });
});
