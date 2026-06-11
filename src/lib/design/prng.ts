/**
 * Stable small seed derived from a string (e.g. a card URL) so the same
 * asset wobbles identically everywhere it appears — editor and published
 * article render the exact same curve.
 */
export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 9973) + 1;
}

export function makePrng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
