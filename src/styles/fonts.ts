import { DM_Sans, Noto_Sans_TC, Noto_Serif_TC, Playfair_Display } from 'next/font/google';

/*
 * The site's four typefaces, self-hosted through next/font: downloaded at
 * build time and served from /_next/static/media with the page's own CSS,
 * instead of a render-blocking stylesheet from fonts.googleapis.com that
 * then fetched the files from a second origin. Each face only sets a CSS
 * variable on <html>; tokens.css builds --font-heading / --font-body from
 * them (and TweaksPanel's heading override names the same variables).
 *
 * The Latin faces keep the static weights the old stylesheet asked for, and
 * each is the face some rendered text resolves to (a 600 heading lands on
 * Playfair 700, a 600 body line on DM Sans 600). Adding a weight changes those
 * matches as much as dropping one. They are small and on every page: their
 * latin files are preloaded.
 *
 * The Chinese faces are variable. Google splits each family into ~100
 * unicode-range slices and the browser fetches only those a page's characters
 * fall in — about 20 of Noto Sans TC and 12 of Noto Serif TC on a typical
 * page. Each slice is one variable file whatever the weight, so asking for
 * static weights only repeated every slice's @font-face rule once per weight
 * (some 640 rules, ~70 KB of render-blocking CSS); one variable rule per slice
 * is a third of that. Chinese at 500/600 renders at that weight, a little
 * lighter than the 700 a 600 used to land on. They are never preloaded.
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
  weight: 'variable',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-noto-serif-tc',
});

const notoSansTC = Noto_Sans_TC({
  weight: 'variable',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-noto-sans-tc',
});

/** Classes for <html> that define the four font variables tokens.css reads. */
export const fontVariables = [playfair, dmSans, notoSerifTC, notoSansTC].map((f) => f.variable).join(' ');
