/**
 * Validate a `next` param so it can only redirect within this site —
 * must be a single absolute path (no scheme, no host, no protocol-relative).
 * Returns the sanitized path or `null` if it's unsafe / empty.
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  // Judge the path the way the browser will read it: URL parsing drops tabs
  // and newlines and reads a backslash as a slash, so "/\t/evil.example"
  // passes a prefix check yet lands on //evil.example. Resolve it against a
  // stand-in origin and keep it only if it stays there.
  let url: URL;
  try {
    url = new URL(raw, SAME_SITE);
  } catch {
    return null;
  }
  if (url.origin !== SAME_SITE) return null;
  return url.pathname + url.search + url.hash;
}

/** A placeholder origin (never contacted) for resolving a path in isolation. */
const SAME_SITE = 'https://same-site.invalid';

/** Build a `?next=...` query suffix, or empty string when no path. */
export function nextQuery(path: string | null | undefined): string {
  const safe = sanitizeNextPath(path);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}
