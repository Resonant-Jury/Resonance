// Fake layout for the organic dropdown panels.
//
// jsdom has no layout engine: every element measures 0×0, and the hand-drawn
// panels (Select, OrganicMenu, Subnavbar) only draw their SVG — borders,
// dividers, the row ink — once they have a width. `stubRowLayout()` gives any
// element that holds menu rows (`role="option"` / `role="menuitem"`) a fixed
// width and a height of rows × rowHeight, and stacks the rows themselves
// top-to-bottom from 0, so pointer and row offsets are easy to reason about:
// the panel sits at the viewport origin, so `clientX/Y` are panel coordinates.
//
//   const layout = stubRowLayout({ width: 200, rowHeight: 44 });
//   afterEach(() => layout.restore());

const ROW = '[role="option"],[role="menuitem"]';

export interface RowLayout {
  width: number;
  rowHeight: number;
  restore: () => void;
}

export function stubRowLayout({
  width = 200,
  rowHeight = 44,
}: { width?: number; rowHeight?: number } = {}): RowLayout {
  const proto = HTMLElement.prototype;
  const rect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  const offW = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  const offH = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');

  const isRow = (el: Element) => el.matches(ROW);
  const rowCount = (el: Element) => el.querySelectorAll(ROW).length;
  const rowIndex = (el: Element) => Array.from(el.parentElement?.children ?? []).indexOf(el);

  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return rowCount(this) > 0 ? width : 0;
    },
  });
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return rowCount(this) * rowHeight;
    },
  });
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element): DOMRect {
      let top = 0;
      let height = 0;
      let w = 0;
      if (isRow(this)) {
        top = rowIndex(this) * rowHeight;
        height = rowHeight;
        w = width;
      } else if (rowCount(this) > 0) {
        height = rowCount(this) * rowHeight;
        w = width;
      }
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        width: w,
        height,
        right: w,
        bottom: top + height,
        toJSON: () => ({}),
      } as DOMRect;
    },
  });

  return {
    width,
    rowHeight,
    restore() {
      if (rect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', rect);
      if (offW) Object.defineProperty(proto, 'offsetWidth', offW);
      if (offH) Object.defineProperty(proto, 'offsetHeight', offH);
    },
  };
}

/**
 * The spreading ink of an open panel, one entry per row in order: the mask
 * circle's radius (0 = no ink) and its centre. Read from the DOM because the
 * panel's SVG is decorative (`aria-hidden`) and has no accessible surface.
 */
export function inkCircles(root: ParentNode = document) {
  return Array.from(root.querySelectorAll<SVGCircleElement>('mask[id^="rowink-"] circle')).map((c) => ({
    r: Number(c.getAttribute('r')),
    cx: Number(c.getAttribute('cx')),
    cy: Number(c.getAttribute('cy')),
  }));
}

/** The fill of each row's ink wash (what the circle reveals), in row order. */
export function inkFills(root: ParentNode = document) {
  return Array.from(root.querySelectorAll<SVGGElement>('g[mask^="url(#rowink-"]')).map(
    (g) => g.querySelector('path')?.getAttribute('fill') ?? '',
  );
}
