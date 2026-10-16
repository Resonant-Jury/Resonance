/** Small DOM helpers: the promo builds its elements once and only restyles them per frame. */

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | undefined>;
type Child = Node | string | null | undefined | false;

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Child[] = []): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { class?: string; style?: Partial<Record<string, string | number>>; text?: string; attrs?: Attrs } = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts.class) el.className = opts.class;
  if (opts.style) css(el, opts.style);
  if (opts.attrs) setAttrs(el, opts.attrs);
  if (opts.text != null) el.textContent = opts.text;
  append(el, children);
  return el;
}

export function setAttrs(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) el.removeAttribute(k);
    else el.setAttribute(k, String(v));
  }
}

/** Properties whose plain numbers are not lengths; every other number is taken as pixels. */
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'zoom', 'order', 'scale']);

/** Sets inline styles; plain numbers are pixels except on unitless properties. */
export function css(el: HTMLElement | SVGElement, styles: Partial<Record<string, string | number>>) {
  const s = el.style as unknown as Record<string, string>;
  for (const [k, v] of Object.entries(styles)) {
    if (v == null) continue;
    s[k] = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v);
  }
}

/** Opacity and transform in one go — what almost every frame sets. */
export function place(el: HTMLElement | SVGElement, o: { x?: number; y?: number; s?: number; r?: number; opacity?: number; origin?: string }) {
  const parts: string[] = [];
  if (o.x || o.y) parts.push(`translate(${(o.x ?? 0).toFixed(2)}px, ${(o.y ?? 0).toFixed(2)}px)`);
  if (o.r) parts.push(`rotate(${o.r.toFixed(3)}deg)`);
  if (o.s != null && o.s !== 1) parts.push(`scale(${o.s.toFixed(4)})`);
  el.style.transform = parts.join(' ');
  if (o.origin) el.style.transformOrigin = o.origin;
  if (o.opacity != null) {
    el.style.opacity = o.opacity.toFixed(3);
    el.style.visibility = o.opacity <= 0.001 ? 'hidden' : '';
  }
}

/** A path whose drawn length is set as 0 → 1 (a pen drawing it on). */
export function drawable(path: SVGPathElement): (p: number) => void {
  path.setAttribute('pathLength', '1');
  path.style.strokeDasharray = '1 1';
  return (p) => {
    const q = Math.max(0, Math.min(1, p));
    path.style.strokeDashoffset = String(1 - q);
    path.style.visibility = q <= 0 ? 'hidden' : '';
    // A round cap paints a dot at length 0: let the pen touch down over the first few percent instead.
    path.style.opacity = q < 0.1 ? (q / 0.1).toFixed(3) : '';
  };
}

/** A container placed at (x, y) on the stage, sized w × h. */
export function box(x: number, y: number, w: number, h: number, cls = ''): HTMLDivElement {
  return html('div', { class: `abs ${cls}`.trim(), style: { left: x, top: y, width: w, height: h } });
}
