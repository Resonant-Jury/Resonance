/**
 * The bucket key behind one of our own public image URLs
 * (`R2_PUBLIC_BASE/<key>`), or null for any other URL — a picture hosted
 * elsewhere, or something that only looks like ours (`..`, an empty
 * segment, odd characters). The keys we write are
 * `{kind}/{yyyy-mm}/{uuid}.{ext}` (older ones `{kind}/{ownerId}/{yyyy-mm}/…`).
 * Pure: no storage client, so metadata code may ask it too.
 */
export function storageKeyOf(url: string | null | undefined, publicBase = process.env.R2_PUBLIC_BASE): string | null {
  if (!url || !publicBase) return null;
  const base = `${publicBase.replace(/\/+$/, '')}/`;
  if (!url.startsWith(base)) return null;
  const key = url.slice(base.length);
  if (!/^[A-Za-z0-9_.\-/]{1,512}$/.test(key)) return null;
  if (key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  return key;
}
