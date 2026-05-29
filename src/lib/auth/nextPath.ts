/**
 * Validate a `next` param so it can only redirect within this site —
 * must be a single absolute path (no scheme, no host, no protocol-relative).
 * Returns the sanitized path or `null` if it's unsafe / empty.
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/** Build a `?next=...` query suffix, or empty string when no path. */
export function nextQuery(path: string | null | undefined): string {
  const safe = sanitizeNextPath(path);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}
