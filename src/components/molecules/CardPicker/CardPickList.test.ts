import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardPicker/CardPickList.module.css'), 'utf8');

/** The declarations of every rule whose selector ends on the row's title in this state. */
function titleColours(state: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => state.test(selector) && /\.cardTitle\s*$/.test(selector.trim()))
    .map(([, , body]) => /(?:^|;|\s)color:\s*([^;]+);/.exec(body)?.[1].trim() ?? '');
}

describe('a card row’s title', () => {
  // Chosen, or under the pointer, the title takes the deep terracotta of the
  // buttons' labels (4.8:1 on the paper): plain terracotta is 3.5:1, too
  // faint for 15px text.
  it('is the deep terracotta when the row is chosen or hovered, never the plain one', () => {
    const chosen = titleColours(/\[data-chosen\]/);
    const hovered = titleColours(/:hover/);
    expect(chosen).toEqual(['var(--button-on-tonal)']);
    expect(hovered).toEqual(['var(--button-on-tonal)']);
  });
});
