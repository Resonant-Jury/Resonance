/**
 * Pure slug helpers — no network, no Firebase. Kept dependency-free so the
 * uniqueness algorithm can be unit-tested with an injected `isTaken` checker.
 */

/** Normalize an arbitrary string into a URL-safe slug (ASCII, hyphenated). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '') // trim edge hyphens
    .replace(/-{2,}/g, '-') // collapse runs
    .split('-')
    .slice(0, 8) // cap word count
    .join('-')
    .slice(0, 60);
}

/**
 * Resolve a collision-free slug from a base.
 *
 * Strategy (per product spec):
 *   1. the base slug itself
 *   2. base + author handle           (on collision)
 *   3. base + author handle + number  (on further collision)
 *
 * `isTaken` reports whether a candidate is already used by *another* card.
 */
export async function ensureUniqueSlug(
  base: string,
  handle: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'story';
  if (!(await isTaken(root))) return root;

  const handleSlug = slugify(handle);
  const withHandle = handleSlug ? `${root}-${handleSlug}` : root;
  if (withHandle !== root && !(await isTaken(withHandle))) return withHandle;

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${withHandle}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Pathological fallback — effectively never reached.
  return `${withHandle}-${Date.now()}`;
}
