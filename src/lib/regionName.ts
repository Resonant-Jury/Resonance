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

/** The square flags vendored in `public/flags/` (the apps bundle the same set). */
const SQUARE_FLAGS = new Set(['tw', 'jp', 'us', 'kr', 'hk', 'gb']);

/** Region values written before profiles took ISO codes only, as the code they meant. */
const REGION_ALIASES: Record<string, string> = { UK: 'GB' };

/**
 * The ISO code a stored region stands for (an older `UK` is `GB`), so it names
 * and flags the same as one chosen today.
 */
export function regionCode(region: string): string {
  const code = region.trim().toUpperCase();
  return REGION_ALIASES[code] ?? code;
}

/** The square flag's file code (`public/flags/{code}.svg`) for a region, or null when none is vendored. */
export function squareFlagCode(region: string): string | null {
  const code = regionCode(region).toLowerCase();
  return SQUARE_FLAGS.has(code) ? code : null;
}
