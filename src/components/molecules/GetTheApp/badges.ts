/**
 * The stores' official badges, self-hosted unmodified in public/badges/
 * (Apple: "Download on the App Store", Google: "Get it on Google Play"), and
 * where the badge sits inside each file. Apple's SVG is the badge edge to
 * edge; Google's PNG carries clear space of its own — on every side in the
 * English file, above and below only in the Traditional Chinese one. Drawn
 * at the same visible height, the two read as the same size (Google asks for
 * Play's to be no smaller than the others; Apple's minimum is 40 px), and the
 * clear space around each (a quarter of its height, both stores) is the
 * layout's gap instead of the file's padding (GetTheApp.module.css).
 */

export type Store = 'appStore' | 'googlePlay';

export interface BadgeArt {
  src: string;
  /** The file's own size (an SVG's width/height, a PNG's pixels). */
  width: number;
  height: number;
  /** The badge inside the file: everything else is transparent clear space. */
  x: number;
  y: number;
  w: number;
  h: number;
}

type BadgeLocale = 'zh-TW' | 'en';

const ART: Record<Store, Record<BadgeLocale, BadgeArt>> = {
  appStore: {
    'zh-TW': { src: '/badges/appstore-zh-tw.svg', width: 108.85157, height: 40, x: 0, y: 0, w: 108.85157, h: 40 },
    en: { src: '/badges/appstore-en-us.svg', width: 119.66407, height: 40, x: 0, y: 0, w: 119.66407, h: 40 },
  },
  googlePlay: {
    'zh-TW': { src: '/badges/googleplay-zh-tw.png', width: 646, height: 250, x: 0, y: 29, w: 646, h: 192 },
    en: { src: '/badges/googleplay-en.png', width: 646, height: 250, x: 41, y: 41, w: 564, h: 168 },
  },
};

/** A store's badge in the page's language (English for any other). */
export function badgeArt(store: Store, locale: string): BadgeArt {
  return ART[store][locale === 'zh-TW' ? 'zh-TW' : 'en'];
}

/** Every badge file, for the tests that keep them as the stores published them. */
export const ALL_BADGES: readonly BadgeArt[] = Object.values(ART).flatMap((byLocale) => Object.values(byLocale));

/**
 * The badge's geometry in units of its visible height (CSS multiplies by
 * --badge-h): the visible box's width, and the whole file's size and offset
 * inside it, so the box shows the badge and nothing of its padding.
 */
export function badgeGeometry(art: BadgeArt) {
  const unit = art.h;
  return {
    boxWidth: art.w / unit,
    imageWidth: art.width / unit,
    imageHeight: art.height / unit,
    offsetX: art.x / unit,
    offsetY: art.y / unit,
  };
}
