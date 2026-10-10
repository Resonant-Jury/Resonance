import { describe, expect, it } from 'vitest';
import fixture from '../../../native/fixtures/card-colours.json';
import { CARD_HUES } from './dominantHue';
import { CARD_COLOUR_WINDOW, CARD_FAMILY_ORDER, cardPalettes, preferredPalette } from './cardColours';

/** Card i's neighbours in a grid of `columns` filled row by row: the cards before it in its row, and the one above. */
function neighboursBefore(i: number, columns: number): number[] {
  const rowStart = i - (i % columns);
  const before = [];
  for (let j = rowStart; j < i; j++) before.push(j);
  if (i - columns >= 0) before.push(i - columns);
  return before;
}

describe('card colours in a list (native/fixtures/card-colours.json, shared with the apps)', () => {
  it('pins the palette, the window and the order a clash moves through', () => {
    expect(fixture.hues).toEqual([...CARD_HUES]);
    expect(fixture.window).toBe(CARD_COLOUR_WINDOW);
    expect(fixture.order).toEqual(CARD_FAMILY_ORDER.map((o) => [...o]));
    // Each family's order names the five others, once each.
    CARD_FAMILY_ORDER.forEach((order, family) => {
      expect([...order, family].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const palettes = cardPalettes(c.accentHues);
    expect(palettes).toEqual(c.palettes);

    // One column, two, three — and whatever grid the case names: never a neighbour's family.
    for (const columns of [1, 2, 3, ('columns' in c ? c.columns : 1) as number]) {
      palettes.forEach((family, i) => {
        for (const j of neighboursBefore(i, columns)) expect(palettes[j], `card ${i} beside/under ${j} (${columns} columns)`).not.toBe(family);
      });
    }

    // Paging: the colours of what is already shown never change as pages arrive.
    if ('pages' in c && c.pages) {
      let shown = 0;
      for (const size of c.pages) {
        shown += size;
        expect(cardPalettes(c.accentHues.slice(0, shown))).toEqual(c.palettes.slice(0, shown));
      }
      expect(shown).toBe(c.accentHues.length);
    }
  });

  it('keeps each card on its own family whenever it can', () => {
    for (const c of fixture.cases) {
      const palettes = cardPalettes(c.accentHues);
      palettes.forEach((family, i) => {
        const own = preferredPalette(c.accentHues[i], i);
        const near = palettes.slice(Math.max(0, i - CARD_COLOUR_WINDOW), i);
        // Moved only on a clash, and then to the first free family in the fixed order.
        if (!near.includes(own)) expect(family).toBe(own);
        else expect(family).toBe(CARD_FAMILY_ORDER[own].find((f) => !near.includes(f)));
      });
    }
  });

  it('prefers the cover’s family, else the position’s, as the cards always did', () => {
    expect(preferredPalette(60, 4)).toBe(0); // 60° → 55
    expect(preferredPalette(350, 0)).toBe(5); // across 0° → 18
    expect(preferredPalette(null, 7)).toBe(1);
    expect(preferredPalette(undefined, -1)).toBe(5);
  });
});
