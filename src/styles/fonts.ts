import { DM_Sans, Noto_Sans_TC, Noto_Serif_TC, Playfair_Display } from 'next/font/google';

/*
 * The site's four typefaces, self-hosted through next/font: downloaded at
 * build time and served from /_next/static/media with the page's own CSS,
 * instead of a render-blocking stylesheet from fonts.googleapis.com that
 * then fetched the files from a second origin. Each face only sets a CSS
 * variable on <html>; tokens.css builds --font-heading / --font-body from
 * them (and TweaksPanel's heading override names the same variables).
 *
 * The weights are the ones the old stylesheet asked for, and each is the face
 * some rendered text resolves to — a 600 heading lands on Playfair / Noto
 * Serif TC 700, a 600 body line on Noto Sans TC 700, the zh-TW hero title on
 * Noto Serif TC 800. Adding a weight changes those matches as much as
 * dropping one, so the set stays exactly as it was.
 *
 * The Latin faces are small and on every page: their latin files are
 * preloaded. The Chinese faces are split by Google into ~100 unicode-range
 * slices per family; the browser fetches only the slices a page's characters
 * fall in, so they are never preloaded.
 *
 * adjustFontFallback is off: next/font would put a metric-adjusted Times New
 * Roman / Arial right after each face, ahead of the Chinese face in the
 * stack, so glyphs the Latin face lacks (and a Chinese face has) would render
 * in a different font than before.
 */
const playfair = Playfair_Display({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: false,
  variable: '--font-playfair',
});

const dmSans = DM_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: false,
  variable: '--font-dm-sans',
});

const notoSerifTC = Noto_Serif_TC({
  weight: ['400', '700', '800'],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-noto-serif-tc',
});

const notoSansTC = Noto_Sans_TC({
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-noto-sans-tc',
});

/** Classes for <html> that define the four font variables tokens.css reads. */
export const fontVariables = [playfair, dmSans, notoSerifTC, notoSansTC].map((f) => f.variable).join(' ');
