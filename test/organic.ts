// Helpers for asserting on the hand-drawn shapes in jsdom.
//
// The organic atoms measure themselves (`useElementSize` reads offsetWidth /
// offsetHeight) and draw nothing until they have a size; jsdom has no layout,
// so every box is 0×0 and no outline would ever be in the DOM to look for.
// `mockElementSize` gives every element a box for the length of a suite;
// `penLines` then finds the visible pen outline a shape drew inside an element.

import { afterAll, beforeAll } from 'vitest';

/**
 * Gives every HTMLElement a layout box for the suite (call at the top of a
 * `describe` or a test file). Restores jsdom's 0×0 afterwards.
 */
export function mockElementSize(width = 120, height = 40) {
  const proto = HTMLElement.prototype;
  const offsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  beforeAll(() => {
    Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => width });
    Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => height });
  });
  afterAll(() => {
    if (offsetWidth) Object.defineProperty(proto, 'offsetWidth', offsetWidth);
    if (offsetHeight) Object.defineProperty(proto, 'offsetHeight', offsetHeight);
  });
}

/**
 * The pen outlines drawn inside `el`: stroked, unfilled paths whose stroke is
 * actually visible (a fill-only shape keeps a `transparent` stroke path).
 */
export function penLines(el: Element): Element[] {
  return Array.from(el.querySelectorAll('svg path')).filter((p) => {
    const stroke = p.getAttribute('stroke');
    return p.getAttribute('fill') === 'none' && !!stroke && stroke !== 'transparent' && stroke !== 'none';
  });
}
