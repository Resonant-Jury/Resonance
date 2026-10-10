/**
 * A card's published date as its page shows it: the day with its year, in the
 * reader's language (2026年10月10日, Oct 10, 2026) — the same medium date style
 * the apps format with. `timeZone` is 'UTC' for the server render and hydration
 * (the server's zone isn't the reader's), the reader's own zone after.
 */
export function publishedDate(
  publishedAt: Date | string | null | undefined,
  locale: string,
  timeZone?: string,
): { dateTime: string; label: string } | null {
  if (!publishedAt) return null;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return null;
  return {
    dateTime: at.toISOString(),
    label: at.toLocaleDateString(locale, { dateStyle: 'medium', timeZone }),
  };
}
