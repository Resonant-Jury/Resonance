/**
 * Text that writes itself on without moving a glyph — the same hand as the
 * "write" chapter's (write.ts keeps its own copy private): a block's lines and
 * the place after each character are measured once (1×, before any zoom), and
 * a mask per line shows the text up to a distance along the lines — a hard
 * edge for typing, a soft one for a quick hand. The caret's place for any
 * distance comes with it.
 */
import { clamp } from '../time';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

interface Line {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where this line begins along the text written so far (the sum of the widths before it). */
  start: number;
}

export function writeOn(el: HTMLElement, frame: HTMLElement) {
  const node = el.firstChild as Text;
  const text = node.data;
  const base = el.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  const range = document.createRange();

  // The lines, as the text's own rects grouped by their top.
  range.setStart(node, 0);
  range.setEnd(node, text.length);
  const lines: Line[] = [];
  for (const r of [...range.getClientRects()].filter((q) => q.width > 0.5)) {
    const line = lines.find((l) => Math.abs(l.top - (r.top - base.top)) < r.height * 0.5);
    if (line) {
      const right = Math.max(line.left + line.width, r.right - base.left);
      line.left = Math.min(line.left, r.left - base.left);
      line.width = right - line.left;
    } else {
      lines.push({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height, start: 0 });
    }
  }
  lines.sort((a, b) => a.top - b.top);
  let run = 0;
  for (const l of lines) {
    l.start = run;
    run += l.width;
  }
  const total = run;

  // The distance after each grapheme (index 0: before the first).
  const stops = [0];
  let offset = 0;
  for (const { segment } of segmenter.segment(text)) {
    range.setStart(node, offset);
    offset += segment.length;
    range.setEnd(node, offset);
    const rects = [...range.getClientRects()];
    const r = rects[rects.length - 1];
    if (!r) {
      stops.push(stops[stops.length - 1]);
      continue;
    }
    const line = lines.find((l) => Math.abs(l.top - (r.top - base.top)) < r.height * 0.5) ?? lines[lines.length - 1];
    stops.push(line.start + clamp(r.right - base.left - line.left, 0, line.width));
  }

  const lineH = parseFloat(getComputedStyle(el).lineHeight) || lines[0]?.height || 20;
  const bands = lines.map((l) => ({ top: l.top + l.height / 2 - lineH / 2 - 1, h: lineH + 2 }));
  const offX = base.left - origin.left;
  const offY = base.top - origin.top;

  /** Shows the text up to `d` along its lines, with a `soft` px fade at the front. */
  const show = (d: number, soft = 0) => {
    if (d >= total + soft + 0.5) {
      el.style.maskImage = 'none';
      el.style.webkitMaskImage = 'none';
      el.style.visibility = '';
      return;
    }
    el.style.visibility = d <= 0 ? 'hidden' : '';
    const layers = lines.map((l) => {
      const a = d - l.start;
      return `linear-gradient(90deg, #000 ${(a - soft).toFixed(2)}px, transparent ${a.toFixed(2)}px)`;
    });
    const pos = lines.map((l, i) => `${(l.left - 2).toFixed(2)}px ${bands[i].top.toFixed(2)}px`);
    const size = lines.map((l, i) => `${(l.width + soft + 6).toFixed(2)}px ${bands[i].h.toFixed(2)}px`);
    const s = el.style as CSSStyleDeclaration & Record<string, string>;
    for (const prefix of ['mask', 'webkitMask']) {
      s[`${prefix}Image`] = layers.join(', ');
      s[`${prefix}Position`] = pos.join(', ');
      s[`${prefix}Size`] = size.join(', ');
      s[`${prefix}Repeat`] = 'no-repeat';
    }
  };

  /** The caret's place (in `frame`'s 1× coordinates) after `d` along the lines. */
  const caret = (d: number) => {
    const i = Math.max(0, lines.findIndex((l, k) => d < l.start + l.width || k === lines.length - 1));
    const l = lines[i];
    const x = l.left + clamp(d - l.start, 0, l.width);
    return { x: offX + x, y: offY + l.top, h: l.height };
  };

  return { show, caret, total, stops, graphemes: stops.length - 1 };
}
