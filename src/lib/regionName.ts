/**
 * Regions whose full CLDR name carries an administrative qualifier
 * (zh-TW: 中國香港特別行政區, en: Hong Kong SAR China); they go by their short
 * name, as Apple's and Android's region pickers show them (香港, Hong Kong).
 */
const SHORT_NAMED = new Set(['HK', 'MO']);

/**
 * Full localized country name for an ISO 3166-1 region code
 * (e.g. TW + zh-TW → 台灣, TW + en → Taiwan). Falls back to the raw code
 * when the runtime doesn't know the code/locale.
 */
export function regionDisplayName(region: string, locale: string): string {
  try {
    const style = SHORT_NAMED.has(region.toUpperCase()) ? 'short' : 'long';
    return new Intl.DisplayNames([locale], { type: 'region', style }).of(region) ?? region;
  } catch {
    return region;
  }
}

/** The regions a profile offers, in the signup form's order (settings adds the profile's own when it is another). */
export const PROFILE_REGIONS = ['TW', 'JP', 'US', 'KR', 'HK'] as const;

/** A two-letter region's flag emoji (its regional-indicator letters); '' for anything else. */
export function regionFlag(region: string): string {
  const code = region.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
