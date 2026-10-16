/**
 * 47.6 – 58.6 s. 思想地圖: the thought map's dotted paper over the whole stage,
 * the chapter's words on a cream fade at the left. Five cards are set down on
 * the paper one by one — three of mine, 小夏's winter and the card I answered
 * it with; two groups are drawn around two pairs of them (出走, 回家), one card
 * stays free. Three arrows are pulled out of cards' link handles, dock on
 * another card, turn into the map's warm-ink arrows and get their labels:
 * 後來 and 因為 in a quick, sure pair, then — taken slower — 呼應: the
 * resonance, drawn on the map. Its label pops warm, terracotta ripples breathe
 * from my card toward 小夏's (the resonate chapter's arcs), and the camera,
 * after a slow push that shows the whole map, settles in on the 回家 pair for
 * the chapter's hold. The dot grid rides the camera throughout.
 */
import { arrowHeadPath, organicEdgePath, type RectLike } from '@/lib/design/edgePath';
import { seedFromString } from '@/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { css, drawable, html, place, svg } from '../dom';
import { C, chalk, face, icon, INK, INK_LIGHT, INK_STRONG, makePrng, measure, shapeSvg, tagPill, tapMark, uid, wobRect, type IconName } from '../kit';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { clamp, ease, lerp, prog, spring } from '../time';

const DUR = TIMELINE.map.end - TIMELINE.map.start;

// ── The map's own measures (ThoughtMapNode, ThoughtMapCanvas) ───────────
const NODE_W = 232;
const NODE_H = 178;
const GRID = 26;
const WARM_INK = 'oklch(46% 0.045 60)';
const LABEL_FILL = 'oklch(94% 0.02 75)';
const DOT = 'oklch(82% 0.025 75)';
/**
 * The arrows' labels (TagPill sm: 10px at the map's 1×) drawn at film size:
 * 14 here is about 17 px on the stage at the camera's 1.22.
 */
const LABEL = { fontSize: 14, padX: 11, padY: 4 };

type Pt = { x: number; y: number };
type Cubic = [Pt, Pt, Pt, Pt];
type Locale = 'zh-TW' | 'en';

/**
 * What the two cards copy.stories doesn't write say, in both cuts (indices of
 * copy.stories.map.cards; 0, 3 and 4 are the tour's own cards).
 */
const MORE: Record<Locale, Record<1 | 2, { excerpt: string; tags: string[] }>> = {
  'zh-TW': {
    1: { excerpt: '交出識別證的時候，手一直在抖。走出大樓，天空好像比平常大了一點…', tags: ['工作', '勇氣'] },
    2: { excerpt: '離職後的早晨，我翻出十年前的水彩。第一筆就畫歪了，我卻笑了出來…', tags: ['畫畫', '重新開始'] },
  },
  en: {
    1: { excerpt: 'My hands shook as I handed in my badge. Outside, the sky looked a little bigger than usual…', tags: ['Work', 'Courage'] },
    2: { excerpt: 'The first morning after I quit, I found my old watercolours. The first stroke went crooked, and I laughed…', tags: ['Drawing', 'Beginnings'] },
  },
};

// ── The world (map coordinates) ───────────────────────────────────────
// Two groups, each holding a pair side by side, the second a step to the
// right; the free card between them, under the card its arrow points at. The
// pairs' arrows run left to right, the free card's straight up.

/** A group's measures around its two cards: the title's band, the side and foot margins, the gap the arrow and its label span. */
const G = { title: 42, pad: 20, foot: 16, gap: 140 };
const GROUP_W = G.pad * 2 + NODE_W * 2 + G.gap;
const GROUP_H = G.title + NODE_H + G.foot;
/** Groups (GROUP_HUES 88, 215 — the first two a map makes): copy.stories.map.groups by index. */
const GROUPS = [
  { x: 0, y: 0, hue: 88 },
  { x: 170, y: 508, hue: 215 },
];
const FREE_Y = G.title + NODE_H + 88;
/**
 * Cards on the map, by copy.stories.map.cards index: where, their hue
 * (NODE_HUES; 小夏's keeps her card's lavender, my answer its terracotta),
 * the meta row's icon (ThoughtMapNode: visibility, or the pen for a draft),
 * and the tilt they are set down with.
 */
const NODES: { x: number; y: number; hue: number; vis: IconName; tilt: number }[] = [
  { x: G.pad, y: G.title, hue: 18, vis: 'globe', tilt: -1.4 },
  { x: G.pad + NODE_W + G.gap, y: G.title, hue: 140, vis: 'lock', tilt: 1.1 },
  { x: 350, y: FREE_Y, hue: 88, vis: 'pen', tilt: -1.0 },
  { x: GROUPS[1].x + G.pad + NODE_W + G.gap, y: GROUPS[1].y + G.title, hue: 290, vis: 'globe', tilt: 0.9 },
  { x: GROUPS[1].x + G.pad, y: GROUPS[1].y + G.title, hue: 55, vis: 'globe', tilt: 1.3 },
];
const WORLD = { w: GROUPS[1].x + GROUP_W, h: GROUPS[1].y + GROUP_H };

// ── Timing (local seconds) ────────────────────────────────────────────
/** Cards set down in reading order (by NODES index). */
const CARD_ORDER = [0, 1, 2, 4, 3];
const CARD_IN = [0.45, 0.7, 0.95, 1.2, 1.45];
const GROUP_IN = [1.85, 2.3];
/**
 * Each arrow (copy.stories.map.arrows order): when the finger sets off for its
 * handle, then reach the handle, press, drag, a beat on the target, let go.
 * The first is shown whole, the second follows it briskly, the third — the
 * resonance — is drawn slower and held on its target a moment longer.
 */
const ARROWS = [
  { at: 3.0, reach: 0.48, press: 0.08, drag: 0.6, beat: 0.14 },
  { at: 4.36, reach: 0.36, press: 0.07, drag: 0.5, beat: 0.1 },
  { at: 5.48, reach: 0.44, press: 0.08, drag: 0.72, beat: 0.2 },
];
/** The last arrow's ripples: two breaths after it lets go, three arcs each (stagger, life, radii, peak opacity). */
const RIPPLE = { breaths: [0.3, 1.75], stagger: 0.26, life: 1.45, r: [16, 118] as const, alpha: 0.8 };

// ── The camera: a slow push until all of the map is in view, then in on the 回家 pair for the hold ──
/** The stage point the camera's focus sits on (the demonstration's centre, x 800–1800, y 120–1030). */
const FOCUS = { x: 1300, y: 575 };
const CAM0 = { s: 1.12, fx: 385, fy: 345 };
const CAM_ALL = { s: 1.22, fx: WORLD.w / 2, fy: WORLD.h / 2 };
/**
 * In on the 回家 pair: the group centred across the demonstration, the free card above it with its top 190 px
 * down the stage, so 因為 fades into the header's mist and the first group is gone under it.
 */
const HOME_S = 1.5;
const CAM_HOME = { s: HOME_S, fx: GROUPS[1].x + GROUP_W / 2, fy: FREE_Y + (FOCUS.y - 190) / HOME_S };
/** The two pushes overlap, so the camera never stops between them; the second sets off as 呼應 docks. */
const PUSH_ALL = [0, 7.0] as const;
const PUSH_HOME = [6.5, 10.9] as const;

// ── Helpers ───────────────────────────────────────────────────────────

const f2 = (n: number) => +n.toFixed(2);
const rectOf = (n: { x: number; y: number }): RectLike => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H });
const centreOf = (r: RectLike): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function parseCubic(d: string): Cubic {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return [
    { x: n[0], y: n[1] },
    { x: n[2], y: n[3] },
    { x: n[4], y: n[5] },
    { x: n[6], y: n[7] },
  ];
}
const cubicD = (c: Cubic) => `M ${f2(c[0].x)},${f2(c[0].y)} C ${f2(c[1].x)},${f2(c[1].y)} ${f2(c[2].x)},${f2(c[2].y)} ${f2(c[3].x)},${f2(c[3].y)}`;
const lerpCubic = (a: Cubic, b: Cubic, p: number): Cubic => a.map((pt, i) => ({ x: lerp(pt.x, b[i].x, p), y: lerp(pt.y, b[i].y, p) })) as Cubic;
const endAngle = (c: Cubic) => Math.atan2(c[3].y - c[2].y, c[3].x - c[2].x);
const inside = (r: RectLike, p: Pt, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const smooth = (p: number) => p * p * (3 - 2 * p);

/** edgePath's rectAnchor with its axis given rather than picked by the dominant one. */
function anchorOn(r: RectLike, toward: Pt, axis: 'x' | 'y') {
  const c = centreOf(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (axis === 'x') {
    const m = Math.min(14, r.h / 2);
    const slide = clamp(dy * 0.25, -r.h / 2 + m, r.h / 2 - m);
    return dx >= 0 ? { x: r.x + r.w, y: c.y + slide, nx: 1, ny: 0 } : { x: r.x, y: c.y + slide, nx: -1, ny: 0 };
  }
  const m = Math.min(14, r.w / 2);
  const slide = clamp(dx * 0.25, -r.w / 2 + m, r.w / 2 - m);
  return dy >= 0 ? { x: c.x + slide, y: r.y + r.h, nx: 0, ny: 1 } : { x: c.x + slide, y: r.y, nx: 0, ny: -1 };
}

/** organicEdgePath's cubic on a given axis (the same seeded wobble). */
function edgeOnAxis(src: RectLike, tgt: RectLike, seed: number, axis: 'x' | 'y'): Cubic {
  const rnd = makePrng(seed);
  const start = anchorOn(src, centreOf(tgt), axis);
  const end = anchorOn(tgt, centreOf(src), axis);
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const reach = clamp(dist * 0.38, 26, 150);
  const jitter = () => (rnd() - 0.5) * Math.min(18, dist * 0.12);
  const p1 = { x: start.x + start.nx * reach + (start.nx === 0 ? jitter() : 0), y: start.y + start.ny * reach + (start.ny === 0 ? jitter() : 0) };
  const p2 = { x: end.x + end.nx * reach + (end.nx === 0 ? jitter() : 0), y: end.y + end.ny * reach + (end.ny === 0 ? jitter() : 0) };
  return [{ x: start.x, y: start.y }, p1, p2, { x: end.x, y: end.y }];
}

/**
 * The draft arrow from `src` to the pointer. The app's (organicEdgePath to a
 * 2 px box at the pointer) leaves the side of the card facing the pointer and
 * jumps to the next side as the pointer crosses a diagonal; here the two
 * sides' curves hand over across a band around it, so the line never jumps.
 */
function draftTo(src: RectLike, p: Pt, seed: number): Cubic {
  const box = { x: p.x - 1, y: p.y - 1, w: 2, h: 2 };
  const c = centreOf(src);
  const dx = Math.abs(p.x - c.x);
  const dy = Math.abs(p.y - c.y);
  const w = smooth(clamp((dy / Math.max(1e-6, dx + dy) - 0.4) / 0.2));
  if (w <= 0) return edgeOnAxis(src, box, seed, 'x');
  if (w >= 1) return edgeOnAxis(src, box, seed, 'y');
  return lerpCubic(edgeOnAxis(src, box, seed, 'x'), edgeOnAxis(src, box, seed, 'y'), w);
}

/** A glyph the kit doesn't carry (Icon's `minus`), drawn the same way. */
function minusIcon(size: number, color: string) {
  return svg('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': INK_STRONG, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'display:block;flex-shrink:0;overflow:visible' }, [
    svg('path', { d: 'M4.4,11.9 C8.8,13.2 15.1,10.8 19.6,12.1' }),
  ]);
}

/** ThoughtMapNode: the card at rest and as a link target, plus its link handle. */
function mapNode(o: { id: string; x: number; y: number; hue: number; title: string; excerpt: string; tags: readonly string[]; vis: IconName }) {
  const seed = seedFromString(o.id);
  const d = wobRect(NODE_W, NODE_H, 18, seed, autoMag(NODE_W, NODE_H), { segmentsH: [3, 4], segmentsV: 2, curve: 1, cornerJitter: 0.8, cornerOffset: 3 });
  const outline = (fill: string, stroke: string, width: number) => {
    const f = svg('path', { d, fill, filter: chalk(seed % 6) });
    const s = svg('path', { d, fill: 'none', stroke, 'stroke-width': width, 'stroke-linejoin': 'round' });
    return shapeSvg(NODE_W, NODE_H, [f, s]);
  };
  const rest = outline(`oklch(97.5% 0.012 ${o.hue})`, `oklch(52% 0.11 ${o.hue})`, INK);
  const hot = outline(`oklch(92.5% 0.045 ${o.hue})`, `oklch(38% 0.13 ${o.hue})`, INK_STRONG);

  // A two-line title shares its words between the lines (no word left alone on the second).
  const title = html('div', { text: o.title, style: { fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: C.text, textWrap: 'balance' } });
  const excerpt = html('p', { text: o.excerpt, style: { fontFamily: 'var(--font-body)', fontSize: 11.5, lineHeight: 1.6, color: C.muted, marginTop: 6 } });
  const fade = 'linear-gradient(to bottom, #000 calc(100% - 14px), transparent)';
  const body = html('div', { style: { flex: 1, minHeight: 0, overflow: 'hidden', maskImage: fade, webkitMaskImage: fade } }, [title, excerpt]);
  const tags = html('span', { text: o.tags.map((t) => `#${t}`).join(' '), style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
  const meta = html('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 11.5, color: C.muted, minHeight: 18 } }, [icon(o.vis, 14, 'currentColor').el, tags]);
  const content = html('div', { style: { position: 'relative', zIndex: 1, height: '100%', padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 } }, [body, meta]);

  // The dashed link handle on the right edge (shown on hover).
  const handle = html('div', {
    class: 'abs',
    style: { left: NODE_W + 15 - 28, top: NODE_H / 2 - 14, width: 28, height: 28, borderRadius: '50%', border: '1.6px dashed var(--field-border-hover)', background: C.cardBg, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  }, [icon('arrow-right', 14, 'currentColor').el]);

  const el = html('div', { class: 'abs', style: { left: o.x, top: o.y, width: NODE_W, height: NODE_H } }, [rest, hot, content, handle]);
  return { el, hot, handle, rect: rectOf(o), hue: o.hue, id: o.id };
}

export const map: Scene = {
  id: 'map',
  ...TIMELINE.map,
  build({ copy, locale }) {
    const s = copy.stories;
    const root = html('div', { class: 'scene', style: { background: C.cardBg } });

    // ── Paper: the dot grid riding the camera, a cream fade under the words ──
    const dots = html('div', { class: 'abs', style: { left: 0, top: 0, width: 1920, height: 1080, backgroundImage: `radial-gradient(${DOT} 1.2px, transparent 1.5px)` } });
    const wash = html('div', {
      class: 'abs',
      style: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        background: [
          // The header's band stays the tour's plain cream; the paper starts under its rule.
          `linear-gradient(180deg, ${C.cream} 0px, ${C.cream} 84px, transparent 132px)`,
          `linear-gradient(90deg, ${C.cream} 0px, ${C.cream} 560px, color-mix(in oklch, ${C.cream} 55%, transparent) 690px, transparent 800px)`,
        ].join(', '),
      },
    });
    root.append(dots, wash);

    // ── The chapter's words ──────────────────────────────────────────
    const words = narration({ icon: 'frame', eyebrow: copy.narration.map.eyebrow, title: copy.narration.map.title, body: copy.narration.map.body });
    css(words.el, { top: Math.round(96 + (984 - words.h) / 2 - 12) });

    // ── The world ────────────────────────────────────────────────────
    const world = html('div', { class: 'abs', style: { left: 0, top: 0, width: WORLD.w, height: WORLD.h, transformOrigin: '0 0' } });

    const text = (card: number) => {
      if (card === 0) return { excerpt: s.myCard.excerpt, tags: s.myCard.tags };
      if (card === 3) return { excerpt: s.theirCard.excerpt, tags: s.theirCard.tags };
      if (card === 4) return { excerpt: s.resonanceCard.excerpt, tags: s.resonanceCard.tags };
      return MORE[locale][card as 1 | 2];
    };
    const nodes = NODES.map((n, i) => mapNode({ id: `map-card-${i}`, x: n.x, y: n.y, hue: n.hue, title: s.map.cards[i], ...text(i), vis: n.vis }));

    // Groups: the translucent fill, title and trash under everything; the rim re-inked above the cards.
    const groups = GROUPS.map((g, i) => {
      const seed = seedFromString(`map-group-${i}`);
      const d = wobRect(GROUP_W, GROUP_H, 34, seed, autoMag(GROUP_W, GROUP_H), { segmentsH: autoSegments(GROUP_W), segmentsV: autoSegments(GROUP_H), curve: 0.6, cornerJitter: 1, cornerOffset: 5 });
      const fill = shapeSvg(GROUP_W, GROUP_H, [svg('path', { d, fill: `oklch(96.5% 0.032 ${g.hue} / 0.78)` })]);
      const title = html('div', {
        text: s.map.groups[i],
        style: { position: 'absolute', top: 0, left: 0, right: 44, zIndex: 1, padding: '12px 20px 10px', fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      });
      const trash = html('div', { style: { position: 'absolute', top: 8, right: 10, zIndex: 1, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted } }, [icon('trash', 15, 'currentColor').el]);
      const box = html('div', { class: 'abs', style: { left: g.x, top: g.y, width: GROUP_W, height: GROUP_H } }, [fill, title, trash]);
      const rimPath = svg('path', { d, fill: 'none', stroke: `oklch(60% 0.085 ${g.hue})`, 'stroke-width': INK_LIGHT, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      const rim = html('div', { class: 'abs', style: { left: g.x, top: g.y, width: GROUP_W, height: GROUP_H } }, [shapeSvg(GROUP_W, GROUP_H, [rimPath])]);
      return { box, fill, title, trash, rim, drawRim: drawable(rimPath) };
    });

    // Arrows: the finished one (warm ink), the draft pulled out of the handle, the dock dots, the label.
    const edgeLayer = svg('svg', { width: 1, height: 1, class: 'abs', style: 'left:0;top:0;overflow:visible;pointer-events:none' });
    const draftLayer = svg('svg', { width: 1, height: 1, class: 'abs', style: 'left:0;top:0;overflow:visible;pointer-events:none' });
    const clips = svg('defs', {});
    draftLayer.append(clips);
    const edges = s.map.arrows.map(([from, to, label], k) => {
      const src = nodes[from];
      const tgt = nodes[to];
      const seed = seedFromString(`${src.id}_${tgt.id}`);
      const geo = organicEdgePath(src.rect, tgt.rect, seed);
      const docked = parseCubic(geo.d);
      const line = svg('path', { d: geo.d, fill: 'none', stroke: WARM_INK, 'stroke-width': INK, 'stroke-linecap': 'round' });
      const head = svg('path', { d: arrowHeadPath(geo.end, geo.endAngle, 13, seed + 7), fill: 'none', stroke: WARM_INK, 'stroke-width': INK, 'stroke-linecap': 'round' });
      const final = svg('g', {}, [line, head]);
      edgeLayer.append(final);

      // The draft never shows over its own card: it is clipped to everything outside the card's box.
      const r0 = src.rect;
      const clipId = uid('map-draft');
      clips.append(
        svg('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, [
          svg('path', { 'clip-rule': 'evenodd', d: `M -4000,-4000 H 6000 V 6000 H -4000 Z M ${r0.x + 2},${r0.y + 2} V ${r0.y + r0.h - 2} H ${r0.x + r0.w - 2} V ${r0.y + 2} Z` }),
        ]),
      );
      const hue = `oklch(52% 0.11 ${src.hue})`;
      const dLine = svg('path', { fill: 'none', stroke: hue, 'stroke-width': INK_STRONG, 'stroke-linecap': 'round' });
      const dHead = svg('path', { fill: 'none', stroke: hue, 'stroke-width': INK_STRONG, 'stroke-linecap': 'round' });
      const r = tgt.rect;
      const dots = [
        [r.x + r.w / 2, r.y],
        [r.x + r.w, r.y + r.h / 2],
        [r.x + r.w / 2, r.y + r.h],
        [r.x, r.y + r.h / 2],
      ].map(([cx, cy]) => svg('circle', { cx, cy, r: 5.5, stroke: hue, 'stroke-width': INK }));
      const draft = svg('g', {}, [svg('g', { 'clip-path': `url(#${clipId})` }, [dLine, dHead]), ...dots]);
      draftLayer.append(draft);

      const pill = tagPill(label, LABEL_FILL, LABEL);
      const labelEl = html('div', { class: 'abs', style: { left: geo.mid.x - pill.w / 2, top: geo.mid.y - pill.h / 2, width: pill.w, height: pill.h, zIndex: 4 } }, [pill.el]);

      // The drag: from the handle's centre to a point just inside the target, by the side the arrow docks on.
      const { at, reach, press, drag, beat } = ARROWS[k];
      const handlePt = { x: src.rect.x + NODE_W + 1, y: src.rect.y + NODE_H / 2 };
      const endPt = { x: geo.end.x - geo.end.nx * 30, y: geo.end.y - geo.end.ny * 30 };
      const len = Math.hypot(endPt.x - handlePt.x, endPt.y - handlePt.y);
      const bow = { x: (handlePt.x + endPt.x) / 2 + (-(endPt.y - handlePt.y) / len) * len * 0.1, y: (handlePt.y + endPt.y) / 2 + ((endPt.x - handlePt.x) / len) * len * 0.1 };
      const t0 = at + reach + press;
      const t1 = t0 + drag;
      const pointer = (t: number): Pt => {
        const u = ease.inOutSine(prog(t, t0, t1));
        const a = (1 - u) * (1 - u);
        const b = 2 * u * (1 - u);
        const c = u * u;
        return { x: a * handlePt.x + b * bow.x + c * endPt.x, y: a * handlePt.y + b * bow.y + c * endPt.y };
      };
      // When the pointer comes near the target (dots show) and when it is over it (the arrow docks).
      let tNear = t1;
      let tDock = t1;
      for (let i = 0; i <= 400; i++) {
        const t = t0 + ((t1 - t0) * i) / 400;
        if (tNear === t1 && inside(r, pointer(t), 90)) tNear = t;
        if (inside(r, pointer(t))) {
          tDock = t;
          break;
        }
      }
      return { at, reach, press, src, tgt, seed, geo, docked, final, draft, dLine, dHead, dots, label: labelEl, pillFill: pill.face.fill, handlePt, endPt, pointer, t0, t1, tNear, tDock, rel: t1 + beat };
    });

    // The resonance's ripples (resonate's arcs): from my card's edge where its arrow leaves, bulging toward 小夏's card.
    const echo = edges[edges.length - 1];
    const rc = { x: echo.geo.start.x - 4, y: echo.geo.start.y };
    const SPAN = (38 * Math.PI) / 180;
    const arc = (r: number) => {
      const x0 = rc.x + Math.cos(SPAN) * r;
      const ya = rc.y - Math.sin(SPAN) * r;
      const yb = rc.y + Math.sin(SPAN) * r;
      const cx = rc.x + r * 1.1 * 1.18;
      return `M ${x0.toFixed(1)},${ya.toFixed(1)} Q ${cx.toFixed(1)},${rc.y.toFixed(1)} ${x0.toFixed(1)},${yb.toFixed(1)}`;
    };
    const ripples = RIPPLE.breaths.flatMap((b) =>
      [0, 1, 2].map((i) => ({
        start: echo.rel + b + i * RIPPLE.stagger,
        // The stroke keeps chapter 3's stage weight whatever the camera's zoom.
        el: svg('path', { fill: 'none', stroke: C.terracotta, 'stroke-width': INK_STRONG * 1.2, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
      })),
    );
    const rippleLayer = svg('svg', { width: 1, height: 1, class: 'abs', style: 'left:0;top:0;overflow:visible;pointer-events:none' }, ripples.map((r) => r.el));

    // Layers, bottom to top: group fills, arrows, ripples, cards, the draft, group rims, labels.
    world.append(...groups.map((g) => g.box), edgeLayer, rippleLayer, ...nodes.map((n) => n.el), draftLayer, ...groups.map((g) => g.rim), ...edges.map((e) => e.label));
    // The paper's edges: what the camera pushes under the header's rule, or left past the demonstration, fades into
    // the cream — at the top over a mist that deepens with the push in, so the cards leaving there dissolve.
    const view = html('div', { class: 'abs', style: { left: 0, top: 0, width: 1920, height: 1080, maskComposite: 'intersect', webkitMaskComposite: 'source-in' } }, [world]);
    const mist = (deep: number) => {
      const m = `linear-gradient(180deg, transparent ${Math.round(lerp(80, 100, deep))}px, #000 ${Math.round(lerp(118, 178, deep))}px), linear-gradient(90deg, transparent 700px, #000 790px)`;
      css(view, { maskImage: m, webkitMaskImage: m });
    };

    // ── The zoom cluster, bottom left as in the app (− the zoom + and the eye) ──
    const ZOOM_UI = 1.1;
    const pct = html('span', { text: '100%', style: { position: 'relative', zIndex: 1, fontFamily: 'var(--font-body)', fontSize: 12, color: C.muted, minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' } });
    const zbtn = (child: Element) => html('span', { style: { position: 'relative', zIndex: 1, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted } }, [child]);
    const cluster = html('div', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px' } }, [
      zbtn(minusIcon(16, 'currentColor')),
      pct,
      zbtn(icon('plus', 16, 'currentColor').el),
      zbtn(icon('eye', 16, 'currentColor').el),
    ]);
    const { w: zw, h: zh } = measure(cluster);
    const sheet = face(wobRect(zw, zh, 18, 41, autoMag(zw, zh), { segmentsH: autoSegments(zw), segmentsV: autoSegments(zh), curve: autoCurve(zw, zh) }), zw, zh, {
      fill: C.cardBg,
      grain: { opacity: 0.3, frequency: 0.88, seed: 41 },
    });
    cluster.prepend(sheet.el);
    css(cluster, { width: zw, height: zh });
    const zoomBox = html('div', { class: 'abs', style: { left: 808, top: 1028 - zh * ZOOM_UI, width: zw * ZOOM_UI, height: zh * ZOOM_UI } }, [
      html('div', { style: { zoom: ZOOM_UI } }, [cluster]),
    ]);

    const finger = tapMark();
    root.append(view, words.el, zoomBox, finger.el);

    const camera = (t: number) => {
      const a = ease.inOutSine(prog(t, PUSH_ALL[0], PUSH_ALL[1]));
      const b = ease.inOutSine(prog(t, PUSH_HOME[0], PUSH_HOME[1]));
      const at = (k: 's' | 'fx' | 'fy') => CAM0[k] + (CAM_ALL[k] - CAM0[k]) * a + (CAM_HOME[k] - CAM_ALL[k]) * b;
      const sc = at('s');
      return { s: sc, x: FOCUS.x - at('fx') * sc, y: FOCUS.y - at('fy') * sc, home: b };
    };

    /** Where the finger is (map coordinates), how pressed, its ring, and how visible. */
    const fingerAt = (t: number) => {
      const first = edges[0];
      let at: Pt = { x: first.handlePt.x + 70, y: first.handlePt.y + 64 };
      let press = 0;
      let ring = 0;
      for (const e of edges) {
        if (t < e.at) break;
        const reach = ease.inOutCubic(prog(t, e.at, e.at + e.reach));
        at = { x: lerp(at.x, e.handlePt.x, reach), y: lerp(at.y, e.handlePt.y, reach) };
        if (t >= e.t0) at = e.pointer(t);
        // A lift may still be finishing as the next reach sets off: the press eases out whichever arrow it belongs to.
        const pIn = ease.outCubic(prog(t, e.at + e.reach, e.at + e.reach + e.press));
        const pOut = ease.inOutCubic(prog(t, e.rel, e.rel + 0.1));
        press = Math.max(press, pIn * (1 - pOut));
        ring = prog(t, e.at + e.reach, e.at + e.reach + 0.45);
      }
      const last = edges[edges.length - 1];
      // Lifted off after the last arrow: a short drift away as it fades.
      const lift = ease.outCubic(prog(t, last.rel + 0.1, last.rel + 0.6));
      at = { x: at.x + 18 * lift, y: at.y + 22 * lift };
      const opacity = Math.min(ease.outCubic(prog(t, first.at - 0.25, first.at + 0.05)), 1 - ease.inOutCubic(prog(t, last.rel + 0.1, last.rel + 0.5)));
      return { at, press, ring, opacity };
    };

    const update = (t: number) => {
      // Camera and paper.
      const cam = camera(t);
      world.style.transform = `translate(${cam.x.toFixed(2)}px, ${cam.y.toFixed(2)}px) scale(${cam.s.toFixed(4)})`;
      mist(cam.home);
      const tile = GRID * cam.s;
      const ox = ((cam.x % tile) + tile) % tile;
      const oy = ((cam.y % tile) + tile) % tile;
      css(dots, { backgroundSize: `${tile.toFixed(3)}px ${tile.toFixed(3)}px`, backgroundPosition: `${ox.toFixed(2)}px ${oy.toFixed(2)}px` });
      pct.textContent = `${Math.round(cam.s * 100)}%`;
      const toStage = (p: Pt) => ({ x: cam.x + p.x * cam.s, y: cam.y + p.y * cam.s });

      words.update(t, 0.35, DUR);

      // Cards set down on the paper, one by one.
      CARD_ORDER.forEach((i, k) => {
        const t0 = CARD_IN[k];
        const sp = spring(t, t0, 0.8, 0.16);
        const fade = ease.outCubic(prog(t, t0, t0 + 0.32));
        const drop = ease.outCubic(prog(t, t0, t0 + 0.55));
        place(nodes[i].el, { y: -12 * (1 - drop), s: 1.06 - 0.06 * sp, r: NODES[i].tilt * (1 - sp), opacity: fade, origin: '50% 50%' });
      });

      // Groups drawn around their pairs: the rim's pen, the fill, the title, the trash.
      groups.forEach((g, i) => {
        const g0 = GROUP_IN[i];
        g.drawRim(ease.inOutCubic(prog(t, g0, g0 + 0.95)));
        place(g.fill, { opacity: 0.999 * ease.outCubic(prog(t, g0 + 0.2, g0 + 0.85)) });
        const tp = ease.outCubic(prog(t, g0 + 0.5, g0 + 1.0));
        place(g.title, { x: (1 - tp) * -6, opacity: tp });
        place(g.trash, { opacity: ease.outCubic(prog(t, g0 + 0.65, g0 + 1.05)) });
      });

      // Arrows: hover, press, drag the dashed draft out, dock, let go, label.
      const hot = nodes.map(() => 0);
      const handleOn = nodes.map(() => 0);
      edges.forEach((e) => {
        const hover = ease.outCubic(prog(t, e.at + e.reach - 0.24, e.at + e.reach - 0.06)) * (1 - ease.inOutCubic(prog(t, e.t0 + 0.04, e.t0 + 0.2)));
        const si = nodes.indexOf(e.src);
        handleOn[si] = Math.max(handleOn[si], hover);

        const dock = ease.outCubic(prog(t, e.tDock, e.tDock + 0.14));
        const done = ease.inOutCubic(prog(t, e.rel, e.rel + 0.26));
        const ti = nodes.indexOf(e.tgt);
        hot[ti] = Math.max(hot[ti], dock * (1 - ease.inOutCubic(prog(t, e.rel, e.rel + 0.22))));

        if (t < e.t0 || done >= 1) {
          place(e.draft, { opacity: 0 });
        } else {
          const p = e.pointer(t);
          const c = lerpCubic(draftTo(e.src.rect, p, e.seed), e.docked, dock);
          e.dLine.setAttribute('d', cubicD(c));
          e.dLine.setAttribute('stroke-dasharray', dock >= 1 ? 'none' : `7 ${(6 * (1 - dock)).toFixed(2)}`);
          e.dHead.setAttribute('d', arrowHeadPath(c[3], endAngle(c), 15, e.seed + 7));
          const dist = Math.hypot(p.x - e.handlePt.x, p.y - e.handlePt.y);
          const grow = clamp((dist - 6) / 36);
          place(e.dLine, { opacity: grow });
          place(e.dHead, { opacity: grow });
          const near = spring(t, e.tNear, 0.4, 0.2);
          const gone = ease.inCubic(prog(t, e.rel, e.rel + 0.2));
          const tint = `color-mix(in oklch, oklch(52% 0.11 ${e.src.hue}) ${Math.round(dock * 100)}%, var(--color-card-bg))`;
          e.dots.forEach((dot) => {
            dot.setAttribute('r', ((5.5 + 1.5 * dock) * Math.max(0.001, near) * (1 - 0.4 * gone)).toFixed(2));
            dot.setAttribute('fill', tint);
            dot.setAttribute('opacity', (Math.min(1, near * 1.5) * (1 - gone)).toFixed(3));
          });
          place(e.draft, { opacity: 1 - done });
        }
        place(e.final, { opacity: done });
        if (e === echo) {
          // The resonance's label pops livelier, and blushes terracotta a moment before it settles back to the map's own.
          const pop = spring(t, e.rel + 0.06, 0.75, 0.34);
          place(e.label, { s: 0.6 + 0.4 * pop, opacity: Math.min(1, pop * 1.6), origin: '50% 50%' });
          const blush = ease.outCubic(prog(t, e.rel + 0.06, e.rel + 0.3)) * (1 - ease.inOutSine(prog(t, e.rel + 0.75, e.rel + 1.65)));
          e.pillFill?.setAttribute('fill', `color-mix(in oklch, ${C.terracottaLight} ${Math.round(blush * 100)}%, ${LABEL_FILL})`);
        } else {
          const pop = spring(t, e.rel + 0.08, 0.55, 0.22);
          place(e.label, { s: 0.55 + 0.45 * pop, opacity: Math.min(1, pop * 1.6), origin: '50% 50%' });
        }
      });

      // Ripples breathing from my card toward 小夏's: each grows out of the edge, soft at first, and fades as it goes.
      ripples.forEach((rp) => {
        const p = prog(t, rp.start, rp.start + RIPPLE.life);
        if (p <= 0 || p >= 1) {
          rp.el.style.visibility = 'hidden';
          return;
        }
        rp.el.style.visibility = '';
        rp.el.setAttribute('d', arc(lerp(RIPPLE.r[0], RIPPLE.r[1], ease.outQuad(p))));
        rp.el.setAttribute('stroke-opacity', (Math.min(1, p / 0.12) * (1 - ease.inQuad(p)) * RIPPLE.alpha).toFixed(3));
      });

      // Link targets deepen while an arrow is docked on them; the source's handle shows on hover.
      nodes.forEach((n, i) => {
        place(n.hot, { opacity: hot[i] });
        place(n.handle, { s: 0.8 + 0.2 * handleOn[i], opacity: handleOn[i], origin: '50% 50%' });
      });

      // The finger, in stage coordinates.
      const fg = fingerAt(t);
      const fp = toStage(fg.at);
      finger.set({ x: fp.x, y: fp.y, opacity: fg.opacity, press: fg.press, ring: fg.ring });
    };

    return { root, update };
  },
};
