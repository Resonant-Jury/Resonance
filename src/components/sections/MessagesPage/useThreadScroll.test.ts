// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { centerRow, useThreadScroll } from './useThreadScroll';

/** A scroller `height` tall over `content` of rows, and a row `rowTop` down the content, 40 tall. */
function thread({ height = 600, content = 20_000, at = 19_400, rowTop }: { height?: number; content?: number; at?: number; rowTop: number }) {
  const scroller = document.createElement('div');
  const row = document.createElement('div');
  scroller.appendChild(row);
  let top = at;
  Object.defineProperties(scroller, {
    clientHeight: { value: height },
    scrollHeight: { value: content },
    scrollTop: { get: () => top, set: (v: number) => (top = v) },
  });
  Object.defineProperty(row, 'offsetHeight', { value: 40 });
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  row.getBoundingClientRect = () => ({ top: rowTop - top }) as DOMRect;
  // A glide: where it was asked to go, and where the scroller stood when it was asked.
  const glides: { from: number; to: number }[] = [];
  scroller.scrollTo = ((opts: ScrollToOptions) => glides.push({ from: top, to: opts.top ?? top })) as Element['scrollTo'];
  return { scroller, row, glides, land: (to: number) => ((top = to), scroller.dispatchEvent(new Event('scrollend'))) };
}

afterEach(() => vi.useRealTimers());

describe('centerRow', () => {
  it('covers a long way at once but for the last window, which glides to the row', () => {
    const t = thread({ rowTop: 1_000 });
    void centerRow(t.scroller, t.row);
    // The row's middle at the window's: 1000 - (600 - 40) / 2.
    expect(t.glides).toEqual([{ from: 720 + 600, to: 720 }]);
  });

  it('glides the whole way when it is short', () => {
    const t = thread({ rowTop: 19_000 });
    void centerRow(t.scroller, t.row);
    expect(t.glides).toEqual([{ from: 19_400, to: 18_720 }]);
  });

  it('says it has arrived only when the glide ends at the row, not when the jump before it ends', async () => {
    const t = thread({ rowTop: 1_000 });
    let arrived = false;
    void centerRow(t.scroller, t.row).then(() => (arrived = true));
    // The jump most of the way ends on its own, a moment later.
    t.land(1_320);
    await Promise.resolve();
    expect(arrived).toBe(false);
    t.land(720);
    await Promise.resolve();
    expect(arrived).toBe(true);
  });

  it('gives up waiting for a glide that never says it ended', async () => {
    vi.useFakeTimers();
    const t = thread({ rowTop: 1_000 });
    let arrived = false;
    void centerRow(t.scroller, t.row).then(() => (arrived = true));
    await vi.advanceTimersByTimeAsync(699);
    expect(arrived).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(arrived).toBe(true);
  });

  it('has arrived at once when the row is already in the middle', async () => {
    const t = thread({ rowTop: 19_400 + 280 });
    await expect(centerRow(t.scroller, t.row)).resolves.toBeUndefined();
  });
});

describe('where the browser doesn’t anchor scrolling by itself (Safari)', () => {
  /** Rows 100 tall, the third of them `grow`s; the scroller well up a long thread. */
  function rows() {
    const scroller = document.createElement('div');
    const heights = [100, 100, 100, 100, 100, 100];
    const els = heights.map((_, i) => {
      const row = document.createElement('div');
      row.dataset.messageKey = `m${i}`;
      scroller.appendChild(row);
      return row;
    });
    let top = 250;
    const topOf = (i: number) => heights.slice(0, i).reduce((a, b) => a + b, 0);
    Object.defineProperties(scroller, {
      clientHeight: { value: 200 },
      scrollHeight: { get: () => heights.reduce((a, b) => a + b, 0) + 5000 },
      scrollTop: { get: () => top, set: (v: number) => (top = v) },
    });
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 200 }) as DOMRect;
    els.forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: topOf(i) - top, bottom: topOf(i) + heights[i] - top }) as DOMRect;
    });
    return { scroller, heights, top: () => top };
  }

  it('keeps the row the reader is at in place when one above it changes height', () => {
    const observed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('CSS', { supports: () => false });
    const t = rows();
    renderHook(() => useThreadScroll({ current: t.scroller }, { firstKey: 'm0', lastKey: 'm5', lastIsOwn: false }));
    // The reader scrolls to the third row (its top half off the window).
    t.scroller.scrollTop = 250;
    t.scroller.dispatchEvent(new Event('scroll'));
    // A shared card's stand-in above becomes the card, 60 shorter.
    t.heights[1] = 40;
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(t.top()).toBe(190);
    vi.unstubAllGlobals();
  });
});

describe('taken up the thread', () => {
  // A glide to a note, a quote's original or a match starts at the bottom: a card arriving below meanwhile
  // must not pull the reader back down to it.
  it('lets go of the bottom while a jump glides away from it', () => {
    const observed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const scroller = document.createElement('div');
    let top = 0;
    Object.defineProperties(scroller, {
      clientHeight: { value: 600 },
      scrollHeight: { value: 3000 },
      scrollTop: { get: () => top, set: (v: number) => (top = v) },
    });
    const { result } = renderHook(() => useThreadScroll({ current: scroller }, { firstKey: 'a', lastKey: 'z', lastIsOwn: false }));
    // At the bottom, something below grows: the reader stays at the bottom.
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(top).toBe(3000);

    result.current.leaveBottom();
    top = 1200;
    for (const cb of observed) cb([], {} as ResizeObserver);
    expect(top).toBe(1200);
    vi.unstubAllGlobals();
  });
});

