/**
 * Full localized country name for an ISO 3166-1 region code
 * (e.g. TW + zh-TW → 台灣, TW + en → Taiwan). Falls back to the raw code
 * when the runtime doesn't know the code/locale.
 */
export function regionDisplayName(region: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}
