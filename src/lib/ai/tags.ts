/**
 * Pure tag helpers — no network, no Firebase. Kept dependency-free (like
 * slugify.ts) so LLM-output parsing and history ranking are unit-testable.
 */

const MAX_TAG_LENGTH = 24;

/**
 * Parse an LLM tag reply into a clean tag list. The model is asked for one tag
 * per line, but replies in the wild also come as JSON arrays, comma/、-joined
 * lists, or bulleted/numbered/#-prefixed lines — accept all of them.
 */
export function parseTagList(raw: string, max = 5): string[] {
  let candidates: string[] = [];

  const trimmed = raw.trim();
  // JSON array reply (possibly inside a ```json fence).
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        candidates = parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      // fall through to plain-text parsing
    }
  }
  if (candidates.length === 0) {
    candidates = trimmed.split(/[\n,，、;；]+/);
  }

  const out: string[] = [];
  for (const c of candidates) {
    const tag = c
      .replace(/^[\s\-*•#>]+/, '') // bullets / hashes
      .replace(/^\d+[.)]\s*/, '') // numbered lists
      .replace(/^["'「『]+|["'」』]+$/g, '') // quotes
      .trim();
    if (!tag || tag.length > MAX_TAG_LENGTH) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Rank tags across many cards by frequency (ties keep first-seen order) and
 * return the top `limit` — the author's working vocabulary, fed to the LLM so
 * it reuses 「家庭」 instead of inventing 「家族」.
 */
export function topTags(tagLists: readonly (readonly string[])[], limit = 20): string[] {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    for (const raw of tags) {
      const tag = typeof raw === 'string' ? raw.trim() : '';
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  // Map iteration preserves insertion order, so a stable sort on count alone
  // keeps first-seen order among equals.
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}
