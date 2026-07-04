/**
 * Pure vector math for the recommender. No I/O, fully deterministic — the
 * SSR/CSR-parity discipline the rest of the codebase applies to seeded SVG
 * geometry applies here too: same input, same centroids, every run.
 */

/** Dot product. For unit vectors this is cosine similarity. */
export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

/** L2-normalize a vector; a zero vector is returned unchanged. */
export function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

/** Element-wise mean of vectors (assumes equal length). */
export function mean(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Cluster unit vectors into at most `k` normalized centroids via Lloyd's
 * algorithm with deterministic, evenly-spaced seeding (no randomness — stable
 * across runs). Returns fewer than `k` centroids when there are fewer points.
 *
 * This is how a person is represented as a *set* of insight directions rather
 * than one averaged-to-mush centre: 「靠近我任何一個體悟群」就算命中.
 */
export function kmeans(vectors: number[][], k: number, maxIter = 12): number[][] {
  const points = vectors.filter((v) => v.length > 0);
  if (points.length === 0) return [];
  if (points.length <= k) return points.map(normalize);

  // Deterministic init: evenly spaced points across the (input-order) set.
  const step = points.length / k;
  let centroids = Array.from({ length: k }, (_, i) => normalize(points[Math.floor(i * step)]));

  for (let iter = 0; iter < maxIter; iter++) {
    const buckets: number[][][] = Array.from({ length: k }, () => []);
    for (const p of points) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < k; c++) {
        const sim = dot(p, centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      buckets[best].push(p);
    }
    const next = centroids.map((prev, c) =>
      buckets[c].length > 0 ? normalize(mean(buckets[c])) : prev
    );
    // Converged when nothing moved appreciably.
    const moved = next.some((cur, c) => dot(cur, centroids[c]) < 0.999999);
    centroids = next;
    if (!moved) break;
  }
  return centroids;
}
