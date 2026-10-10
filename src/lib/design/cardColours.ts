/**
 * The colour family of each card in a list (round 5, B3): no two cards next to
 * each other wear the same one — in a list read top to bottom (the phone's
 * bands, a medium window's one column) or in a grid filled row by row (card i
 * in column i mod n: the web's CardLinkGrid, the tablets' bordered feed).
 *
 * A card's preference stays what it always was (`preferredPalette`): the
 * family nearest its cover's dominant hue, or by position when it has none.
 * Walking the list in order, a card whose preference is the family of one of
 * the `CARD_COLOUR_WINDOW` cards before it moves to the nearest other family
 * (`CARD_FAMILY_ORDER`) that none of them wears.
 *
 * Why three, whatever the layout: any four cards in a row of the list then
 * differ, which keeps neighbours apart in one column (the card above), two
 * (above, and beside) and three (above, and both beside) at once. So one
 * answer serves every width — the server's HTML (which can't know the column
 * count) is already right, a rotation or a resize never recolours a card, and
 * the web and both apps colour the same list the same way. Each card depends
 * only on the cards before it, so appending a page never recolours one
 * already shown.
 *
 * Pinned by native/fixtures/card-colours.json, which the apps' tests run too
 * (Android CardPalette / iOS CardPalette).
 */
import { CARD_HUES, cardHueIndex, hueDistance, nearestCardHue } from './dominantHue';

/** How many cards before a card its family must differ from. */
export const CARD_COLOUR_WINDOW = 3;

/**
 * For each family (palette index, CARD_HUES order), the other five, nearest
 * hue first; equally near, the lower index first. Where a clash moves a card.
 */
export const CARD_FAMILY_ORDER: readonly (readonly number[])[] = CARD_HUES.map((hue, family) =>
  CARD_HUES.map((_, other) => other)
    .filter((other) => other !== family)
    .sort((a, b) => hueDistance(hue, CARD_HUES[a]) - hueDistance(hue, CARD_HUES[b]) || a - b),
);

/** A card's own family: the one nearest its cover's hue, else its position's (cycling through the six). */
export function preferredPalette(accentHue: number | null | undefined, position: number): number {
  if (accentHue != null) return cardHueIndex(nearestCardHue(accentHue));
  const n = CARD_HUES.length;
  return ((position % n) + n) % n;
}

/**
 * The family (palette index) of every card of a list, in the list's order,
 * from the cards' cover hues (null / undefined: no cover hue). Placeholders
 * drawn after the loaded cards (skeletons) take part as cards with no hue.
 */
export function cardPalettes(hues: ReadonlyArray<number | null | undefined>): number[] {
  const out: number[] = [];
  for (let i = 0; i < hues.length; i++) {
    const near = out.slice(Math.max(0, i - CARD_COLOUR_WINDOW));
    const own = preferredPalette(hues[i], i);
    // Six families and three neighbours: some other family is always free.
    out.push(near.includes(own) ? CARD_FAMILY_ORDER[own].find((family) => !near.includes(family))! : own);
  }
  return out;
}
