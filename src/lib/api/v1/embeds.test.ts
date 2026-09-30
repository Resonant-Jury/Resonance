import { describe, expect, it } from 'vitest';
import { cardKeyOfHref, embeddedCardKeys } from './embeds';

// Which cards a story embeds, as the card page's `include=embeds` lists them:
// the reader's rule (a card link standing alone in its paragraph), on the
// Markdown the editor writes.

describe('embeddedCardKeys', () => {
  it('lists a card link standing alone in its paragraph, not one inside a sentence (the editor corpus)', () => {
    expect(embeddedCardKeys('延伸閱讀：\n\n[一場雨後的散步](/card/a-walk-after-the-rain)\n\n結尾。')).toEqual(['a-walk-after-the-rain']);
    expect(embeddedCardKeys('見 [一場雨後的散步](/card/a-walk-after-the-rain) 這張卡片。')).toEqual([]);
  });

  it('keeps reading order, lists each card once, and stops at the limit', () => {
    const story = ['[b](/card/b)', '[a](/card/a)', 'prose', '[b again](/card/b)', '[c](/card/c)'].join('\n\n');
    expect(embeddedCardKeys(story)).toEqual(['b', 'a', 'c']);
    expect(embeddedCardKeys(story, 2)).toEqual(['b', 'a']);
  });

  it('counts embeds in quotes and list items, and never in code', () => {
    const story = [
      '> [quoted](/card/in-quote)',
      '- [listed](/card/in-list)',
      '```\n[code](/card/in-code)\n```',
      '    [indented](/card/indented-code)',
    ].join('\n\n');
    expect(embeddedCardKeys(story)).toEqual(['in-quote', 'in-list']);
  });

  it('ignores other links: absolute URLs, other paths, a card link sharing its paragraph with a line of text', () => {
    const story = [
      '[elsewhere](https://resonance.example/card/abs)',
      '[profile](/u/alice)',
      'A line\n[then a card](/card/soft-break)',
      '![a photo](/card/not-a-link.png)',
    ].join('\n\n');
    expect(embeddedCardKeys(story)).toEqual([]);
  });

  it('reads a reference-style card link like an inline one', () => {
    expect(embeddedCardKeys('[a walk][w]\n\n[w]: /card/a-walk')).toEqual(['a-walk']);
  });

  it('keeps only keys that can name a card (a slug or an id, never a path)', () => {
    expect(cardKeyOfHref('/card/a-walk?from=feed#top')).toBe('a-walk');
    expect(cardKeyOfHref('/card/abc/extra')).toBe('abc');
    expect(cardKeyOfHref('/card/%E4%B8%AD')).toBeNull();
    expect(cardKeyOfHref('/card/%zz')).toBeNull();
    expect(cardKeyOfHref('/cards/x')).toBeNull();
    expect(embeddedCardKeys('[odd](/card/..%2Fusers)')).toEqual([]);
  });
});
