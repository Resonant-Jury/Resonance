// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act } from '@testing-library/react';
import { fireEvent, renderWithIntl, screen } from '@/../test/render';
import { SB, brushSpine } from '@/lib/design/scrollbarGeometry';
import { OrganicScrollbar, organicScrollTarget } from './OrganicScrollbar';

// jsdom lays nothing out: the list, the track and the thumb get a browser's numbers here.
const RAIL_TOP = 100;
// The list's height less the column's 4px inset at each end.
const TRACK_H = 392;
const list = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 };

const isList = (el: Element) => (el as HTMLElement).dataset?.testid === 'list';
const isRail = (el: Element) => /rail/.test(String((el as HTMLElement).className));
const isThumb = (el: Element) => /thumb/.test(String((el as HTMLElement).className));
const thumbTop = (el: HTMLElement) => Number(/translateY\(([-\d.]+)px\)/.exec(el.style.transform)?.[1] ?? 0);

const saved: [object, string, PropertyDescriptor | undefined][] = [];
function stub(proto: object, name: string, desc: PropertyDescriptor) {
  saved.push([proto, name, Object.getOwnPropertyDescriptor(proto, name)]);
  Object.defineProperty(proto, name, { configurable: true, ...desc });
}

let frames: FrameRequestCallback[] = [];

// The size watchers the bar sets up: which elements each watches, and a way to say one of them changed size.
let watchers: { cb: ResizeObserverCallback; els: Set<Element> }[] = [];
class FakeResizeObserver {
  private w: { cb: ResizeObserverCallback; els: Set<Element> };
  constructor(cb: ResizeObserverCallback) {
    this.w = { cb, els: new Set() };
    watchers.push(this.w);
  }
  observe(el: Element) {
    this.w.els.add(el);
  }
  unobserve(el: Element) {
    this.w.els.delete(el);
  }
  disconnect() {
    this.w.els.clear();
  }
}
const observed = () => watchers.flatMap((w) => [...w.els]);
const resized = (el: Element) =>
  watchers.filter((w) => w.els.has(el)).forEach((w) => w.cb([], w as unknown as ResizeObserver));
/** Runs the animation frames the bar asked for (where it writes the thumb's place). */
const flush = () =>
  act(() => {
    const run = frames;
    frames = [];
    run.forEach((cb) => cb(0));
  });

beforeEach(() => {
  Object.assign(list, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
  frames = [];
  watchers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
  stub(HTMLElement.prototype, 'scrollTop', {
    get(this: HTMLElement) {
      return isList(this) ? list.scrollTop : scrollTop.get!.call(this);
    },
    set(this: HTMLElement, v: number) {
      if (!isList(this)) return scrollTop.set!.call(this, v);
      // As a browser does: clamped to the range, then a scroll event.
      list.scrollTop = Math.min(Math.max(v, 0), list.scrollHeight - list.clientHeight);
      this.dispatchEvent(new Event('scroll'));
    },
  });
  stub(HTMLElement.prototype, 'scrollHeight', {
    get(this: HTMLElement) {
      return isList(this) ? list.scrollHeight : 0;
    },
  });
  stub(HTMLElement.prototype, 'clientHeight', {
    get(this: HTMLElement) {
      if (isList(this)) return list.clientHeight;
      // A column with no bar to show is display: none — no room of its own to measure.
      if (isRail(this)) return this.hasAttribute('data-hidden') ? 0 : TRACK_H;
      return 0;
    },
  });
  stub(HTMLElement.prototype, 'getBoundingClientRect', {
    value(this: HTMLElement) {
      const box = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 14, width: 14, x: 0, y: top, toJSON() {} });
      if (isRail(this)) return box(RAIL_TOP, TRACK_H);
      if (isThumb(this)) return box(RAIL_TOP + thumbTop(this), parseFloat(this.style.height) || 0);
      return box(0, 0);
    },
  });
});

afterEach(() => {
  for (const [proto, name, desc] of saved.splice(0).reverse()) {
    if (desc) Object.defineProperty(proto, name, desc);
    else delete (proto as Record<string, unknown>)[name];
  }
  vi.unstubAllGlobals();
});

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} data-testid="list" className={organicScrollTarget}>
        <ul>
          <li>one</li>
          <li>two</li>
        </ul>
      </div>
      <OrganicScrollbar targetRef={ref} seed={31} />
    </div>
  );
}

function mount() {
  const { container } = renderWithIntl(<Harness />);
  flush();
  const rail = container.querySelector<HTMLElement>('[class*="rail"]')!;
  const thumb = () => rail.querySelector<HTMLElement>('[class*="thumb"]');
  return { rail, thumb, el: screen.getByTestId('list') };
}

const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top;
  });
  flush();
};

describe('OrganicScrollbar', () => {
  it('draws no bar over a list with nothing to scroll', () => {
    list.scrollHeight = 404;
    const { rail, thumb } = mount();
    expect(rail).toHaveAttribute('data-hidden');
    expect(thumb()).toBeNull();
  });

  it('draws the thumb once, a brush capsule as long as the visible share, and moves it whole as the list scrolls', () => {
    const { rail, thumb, el } = mount();
    expect(rail).not.toHaveAttribute('data-hidden');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    const t = thumb()!;
    // 392 × 400 / 1000, in whole px: drawn at its real length, never stretched.
    expect(t.style.height).toBe('157px');
    const path = t.querySelector('path')!;
    expect(path.getAttribute('d')).toBe(brushSpine(157, 31));
    expect(t.querySelector('svg')).toHaveAttribute('viewBox', '-7 0 14 157');
    expect(thumbTop(t)).toBe(0);

    scrollTo(el, 300);
    // Halfway down the room the track leaves it; the same element, the same stroke.
    expect(thumb()).toBe(t);
    expect(thumbTop(t)).toBeCloseTo((TRACK_H - 157) / 2);
    expect(path.getAttribute('d')).toBe(brushSpine(157, 31));
    scrollTo(el, 600);
    expect(thumbTop(t)).toBeCloseTo(TRACK_H - 157);
  });

  it('keeps the place a drag took the thumb by: no jump on the press, then 1:1 with the pointer', () => {
    const { rail, thumb, el } = mount();
    scrollTo(el, 300);
    const top = RAIL_TOP + thumbTop(thumb()!);
    // Taken near its foot, far from its middle.
    fireEvent.pointerDown(rail, { clientY: top + 140, button: 0, pointerId: 1 });
    expect(rail).toHaveAttribute('data-dragging');
    expect(list.scrollTop).toBe(300);
    fireEvent.pointerMove(rail, { clientY: top + 140 + 20, pointerId: 1 });
    expect(list.scrollTop).toBeCloseTo(300 + (20 / (TRACK_H - 157)) * 600);
    fireEvent.pointerMove(rail, { clientY: top + 140, pointerId: 1 });
    expect(list.scrollTop).toBeCloseTo(300);
    fireEvent.pointerUp(rail, { clientY: top + 140, pointerId: 1 });
    expect(rail).not.toHaveAttribute('data-dragging');
    // Moving without a press scrolls nothing.
    fireEvent.pointerMove(rail, { clientY: top + 200, pointerId: 1 });
    expect(list.scrollTop).toBeCloseTo(300);
  });

  it('pages down for a press on the track under the thumb, up for one above it', () => {
    const { rail, el } = mount();
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
    fireEvent.pointerDown(rail, { clientY: RAIL_TOP + 300, button: 0, pointerId: 1 });
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 360, behavior: 'smooth' });
    expect(rail).not.toHaveAttribute('data-dragging');
    scrollTo(el, 600);
    fireEvent.pointerDown(rail, { clientY: RAIL_TOP + 10, button: 0, pointerId: 1 });
    expect(scrollBy).toHaveBeenLastCalledWith({ top: -360, behavior: 'smooth' });
    // Not the main button: nothing.
    fireEvent.pointerDown(rail, { clientY: RAIL_TOP + 10, button: 2, pointerId: 1 });
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it('scrolls the list for a wheel over its column, and keeps the page behind it still', () => {
    const { rail } = mount();
    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    act(() => {
      rail.dispatchEvent(wheel);
    });
    expect(list.scrollTop).toBe(120);
    expect(wheel.defaultPrevented).toBe(true);
    // A wheel that counts in lines.
    act(() => {
      rail.dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, bubbles: true, cancelable: true }));
    });
    expect(list.scrollTop).toBe(120 - 48);
  });

  it('follows the content as it grows: an item growing, or a new block in the list, gives a shorter thumb', async () => {
    const { thumb, el } = mount();
    expect(thumb()!.style.height).toBe('157px');
    // Every child of the list is watched for its size (items loading in grow the list's content, not its box).
    const ul = el.querySelector('ul')!;
    expect(observed()).toContain(ul);
    list.scrollHeight = 2000;
    act(() => resized(ul));
    flush();
    expect(thumb()!.style.height).toBe('78px');
    expect(thumb()!.querySelector('path')!.getAttribute('d')).toBe(brushSpine(78, 31));

    // A block added to the list itself (a section appearing) is watched too, and redraws the thumb.
    const section = document.createElement('section');
    list.scrollHeight = 10_000;
    await act(async () => {
      el.append(section);
    });
    flush();
    expect(observed()).toContain(section);
    expect(thumb()!.style.height).toBe(`${SB.min}px`);
  });

  it('hides the list’s own bar through the class it gives the list', () => {
    const { el } = mount();
    expect(organicScrollTarget).toBeTruthy();
    expect(el.className).toBe(organicScrollTarget);
  });
});
