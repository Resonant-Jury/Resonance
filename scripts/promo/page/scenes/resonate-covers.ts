/**
 * The covers of the two cards in "resonate", little doodles of their stories
 * in write-cover's pen language (lib/ai/tasks: pastel, doodle linework,
 * thick organic outlines, grain): pen lines in the card family's border
 * colour, fills from the site's pastel families, all flat.
 *
 * - 小夏's 離家的第一個冬天 (family 1, lavender): a frosted dorm window, snow
 *   falling past it, and on the desk a steaming bowl of instant noodles.
 * - 阿樹's 那年，我也一個人過年 (family 0, terracotta): a red paper lantern, a
 *   hot pot steaming on the table, a glass, and a phone propped up on a video
 *   call home.
 *
 * Left alone each is whole, so any scene showing the card passes `cover` to
 * storyCard and gets the identical picture; `draw(p)` draws it on, p 0 → 1
 * (the sketch first, then its colours, then the small things and the steam).
 */
import { penWave, pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { drawable, svg } from '../dom';
import { C, family, INK, INK_LIGHT, makePrng, shapeGrain, uid, wobCircle, wobRect } from '../kit';
import { ease, prog } from '../time';

type Family = ReturnType<typeof family>;

/** The design box the doodle is drawn in (the cover of a 340-wide StoryCard). */
const DW = 296;
const DH = 184;
/** How far the paint runs past the box (storyCard's clip bleeds 22). */
const B = 24;

const f = (n: number) => n.toFixed(2);

/** A wobbly ellipse, wobCircle's way: anchors round it, each radius nudged by the seed, smooth handles. */
function wobEllipse(cx: number, cy: number, rx: number, ry: number, seed: number, mag = 0.7, segments = 8): string {
  const rnd = makePrng(seed);
  const k = (4 / 3) * Math.tan(Math.PI / (2 * segments));
  const pts = Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    const dr = (rnd() - 0.5) * 2 * mag;
    return { a, ax: rx + dr, ay: ry + dr, x: cx + Math.cos(a) * (rx + dr), y: cy + Math.sin(a) * (ry + dr) };
  });
  let d = `M ${f(pts[0].x)},${f(pts[0].y)}`;
  pts.forEach((p0, i) => {
    const p1 = pts[(i + 1) % segments];
    const c1 = { x: p0.x - Math.sin(p0.a) * p0.ax * k, y: p0.y + Math.cos(p0.a) * p0.ay * k };
    const c2 = { x: p1.x + Math.sin(p1.a) * p1.ax * k, y: p1.y - Math.cos(p1.a) * p1.ay * k };
    d += ` C ${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p1.x)},${f(p1.y)}`;
  });
  return `${d} Z`;
}

/** A small wobbly box at (x, y): windows, caps, a phone. */
function box(x: number, y: number, w: number, h: number, r: number, seed: number, mag = 0.6): string {
  const d = wobRect(w, h, r, seed, mag, { segmentsH: w > 60 ? 2 : 1, segmentsV: h > 60 ? 2 : 1, curve: 0.8, cornerJitter: 0.7, cornerOffset: 0.4 });
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, a: string, b: string) => `${f(Number(a) + x)},${f(Number(b) + y)}`);
}

/** A curl of steam rising from (x, y0) to y1, swaying `sway` either side. */
function steamCurl(x: number, y0: number, y1: number, sway: number, flip = 1): string {
  const h = (y0 - y1) / 2;
  const s = sway * flip;
  return `M ${f(x)},${f(y0)} C ${f(x - s)},${f(y0 - h * 0.35)} ${f(x + s)},${f(y0 - h * 0.7)} ${f(x)},${f(y0 - h)} C ${f(x - s)},${f(y0 - h * 1.3)} ${f(x + s * 0.8)},${f(y0 - h * 1.65)} ${f(x + s * 0.2)},${f(y1)}`;
}

interface Step {
  el: SVGElement;
  at: readonly [number, number];
  draw?: (p: number) => void;
}

/**
 * The bookkeeping both doodles share: every piece is either a pen line (drawn
 * on) or a paint (faded in), each with its window of `draw`'s p.
 */
function doodle(pen: string) {
  const steps: Step[] = [];
  const stroke = (d: string, width: number = INK, extra: Record<string, string | number> = {}) =>
    svg('path', { d, fill: 'none', stroke: pen, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
  /** A pen line, drawn on over `at`. */
  const line = (d: string, at: readonly [number, number], width: number = INK, extra: Record<string, string | number> = {}) => {
    const el = stroke(d, width, extra);
    steps.push({ el, at, draw: drawable(el) });
    return el;
  };
  /** A flat paint (or any group), faded in over `at`. */
  const paint = <T extends SVGElement>(el: T, at: readonly [number, number]) => {
    steps.push({ el, at });
    return el;
  };
  const fill = (d: string, colour: string, at: readonly [number, number], extra: Record<string, string | number> = {}) =>
    paint(svg('path', { d, fill: colour, ...extra }), at);
  const draw = (p: number) => {
    for (const s of steps) {
      const k = prog(p, s.at[0], s.at[1]);
      if (s.draw) s.draw(ease.inOutCubic(k));
      else s.el.style.opacity = ease.outCubic(k).toFixed(3);
    }
  };
  return { stroke, line, paint, fill, draw };
}

/** The whole picture, scaled from the design box to the cover's. */
function framed(cw: number, ch: number, children: SVGElement[]): SVGElement {
  const sx = cw / DW;
  const sy = ch / DH;
  return svg('g', { transform: sx === 1 && sy === 1 ? undefined : `scale(${sx.toFixed(4)},${sy.toFixed(4)})` }, children);
}

const bleed = (colour: string) => svg('rect', { x: -B, y: -B, width: DW + B * 2, height: DH + B * 2, fill: colour });

/** A table or desk top from bleed to bleed, its front edge a pen line at y. */
function tableTop(d: ReturnType<typeof doodle>, y: number, colour: string, seed: number, at: { line: readonly [number, number]; fill: readonly [number, number] }) {
  const edge = pointsToBezier(wavyPoints(DW + B * 2, 0, 0.7, seed, 7));
  const top = d.fill(`${edge} L ${DW + B * 2},${DH + B * 2} L 0,${DH + B * 2} Z`, colour, at.fill, { transform: `translate(${-B},${y})` });
  const line = d.line(edge, at.line, INK, { transform: `translate(${-B},${y})` });
  return [top, line];
}

const grain = (seed: number) => svg('rect', { x: -B, y: -B, width: DW + B * 2, height: DH + B * 2, fill: 'black', filter: shapeGrain(0.14, 0.95, seed) });

// ── 小夏's winter ─────────────────────────────────────────────────────

/** Snow outside, the window's night. */
const NIGHT = 'oklch(84% 0.045 262)';
const SNOW = 'oklch(99% 0.006 270)';
const PORCELAIN = 'oklch(98.5% 0.008 80)';

export function theirCardCover() {
  let drawIt: ((p: number) => void) | null = null;

  const cover = (cw: number, ch: number, fam: Family): SVGElement[] => {
    const pen = fam.border;
    const d = doodle(pen);
    const rnd = makePrng(6203);

    const wall = d.paint(bleed(fam.fill), [0.14, 0.5]);

    // The window: a painted frame, four panes of night, snow in them, frost in their corners.
    const FX = 22;
    const FY = 14;
    const FW = 150;
    const FH = 112;
    const frameD = box(FX, FY, FW, FH, 7, 2101, 0.9);
    const frameFill = d.fill(frameD, fam.interior, [0.3, 0.55]);
    const frameLine = d.line(frameD, [0.02, 0.32]);
    const PW = (FW - 14 - 6) / 2;
    const PH = (FH - 14 - 6) / 2;
    const panes = [0, 1, 2, 3].map((i) => {
      const x = FX + 7 + (i % 2) * (PW + 6);
      const y = FY + 7 + Math.floor(i / 2) * (PH + 6);
      return { x, y, d: box(x, y, PW, PH, 4, 2111 + i * 13, 0.5) };
    });
    const clipId = uid('pane');
    const clip = svg('defs', {}, [svg('clipPath', { id: clipId }, panes.map((p) => svg('path', { d: p.d })))]);
    const paneFills = panes.map((p) => d.fill(p.d, NIGHT, [0.34, 0.58]));
    const paneLines = panes.map((p, i) => d.line(p.d, [0.12 + i * 0.04, 0.36 + i * 0.04], INK_LIGHT));

    // Snow falling, and snow resting on the sill outside.
    const flakes = Array.from({ length: 22 }, () => {
      const x = FX + 6 + rnd() * (FW - 12);
      const y = FY + 6 + rnd() * (FH - 22);
      return svg('circle', { cx: f(x), cy: f(y), r: f(1.3 + rnd() * 1.2), fill: SNOW });
    });
    const star = (x: number, y: number, r: number) =>
      [0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI + 0.3;
        return `M ${f(x - Math.cos(a) * r)},${f(y - Math.sin(a) * r)} L ${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`;
      }).join(' ');
    const stars = svg('path', { d: `${star(FX + 44, FY + 30, 4.2)} ${star(FX + 118, FY + 64, 3.6)}`, fill: 'none', stroke: SNOW, 'stroke-width': 1.3, 'stroke-linecap': 'round' });
    const drifts = panes.slice(2).map((p, i) => {
      const y1 = p.y + PH;
      return svg('path', {
        d: `M ${f(p.x - 2)},${f(y1 + 2)} L ${f(p.x - 2)},${f(y1 - 6)} C ${f(p.x + PW * 0.25)},${f(y1 - 12 + i * 2)} ${f(p.x + PW * 0.55)},${f(y1 - 5)} ${f(p.x + PW * 0.75)},${f(y1 - 8)} C ${f(p.x + PW * 0.88)},${f(y1 - 10)} ${f(p.x + PW)},${f(y1 - 7)} ${f(p.x + PW + 2)},${f(y1 - 6)} L ${f(p.x + PW + 2)},${f(y1 + 2)} Z`,
        fill: SNOW,
      });
    });
    // Frost: fern-like curls feathering in from the panes' outer corners.
    const frost = panes
      .map((p, i) => {
        const left = i % 2 === 0;
        const top = i < 2;
        const cx = left ? p.x : p.x + PW;
        const cy = top ? p.y : p.y + PH;
        const sx = left ? 1 : -1;
        const sy = top ? 1 : -1;
        return [9, 15]
          .map((r) => `M ${f(cx)},${f(cy + sy * r)} Q ${f(cx + sx * r * 0.42)},${f(cy + sy * r * 0.42)} ${f(cx + sx * r)},${f(cy)}`)
          .join(' ');
      })
      .join(' ');
    const frostLine = svg('path', { d: frost, fill: 'none', stroke: SNOW, 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.9 });
    const outside = d.paint(svg('g', { 'clip-path': `url(#${clipId})` }, [...flakes, stars, ...drifts, frostLine]), [0.5, 0.74]);

    // The sill under it.
    const sillD = box(FX - 9, FY + FH - 2, FW + 18, 8, 3, 2141, 0.4);
    const sillFill = d.fill(sillD, fam.interior, [0.36, 0.58]);
    const sillLine = d.line(sillD, [0.2, 0.42]);

    // The desk.
    const desk = tableTop(d, 150, family(3).tag, 2161, { line: [0.08, 0.36], fill: [0.3, 0.55] });
    const deskGrain = d.line('M 18,166 C 48,165 80,167 110,166 M 148,176 C 180,175 214,177 252,175.5', [0.62, 0.8], INK_LIGHT, { opacity: 0.7 });

    // The bowl of instant noodles: porcelain with a sky band, the broth, the noodles, half an egg, scallion.
    const BX = 228;
    const RY = 116;
    const footD = box(BX - 15, 153, 30, 7, 2.5, 2171, 0.3);
    const foot = [d.fill(footD, PORCELAIN, [0.38, 0.6]), d.line(footD, [0.26, 0.44])];
    const bodyD = `M ${BX - 46},${RY} C ${BX - 44},${RY + 24} ${BX - 24},${RY + 40} ${BX},${RY + 40} C ${BX + 24},${RY + 40} ${BX + 44},${RY + 24} ${BX + 46},${RY} Z`;
    const body = d.fill(bodyD, PORCELAIN, [0.36, 0.6]);
    const bandD = `M ${BX - 42},${RY + 10} C ${BX - 22},${RY + 16} ${BX + 22},${RY + 16} ${BX + 42},${RY + 10} L ${BX + 39},${RY + 17} C ${BX + 20},${RY + 24} ${BX - 20},${RY + 24} ${BX - 39},${RY + 17} Z`;
    const band = d.fill(bandD, family(4).tag, [0.46, 0.68]);
    const bodyLine = d.line(bodyD, [0.14, 0.42]);
    const rimD = wobEllipse(BX, RY, 46, 10, 2181, 0.5);
    const rim = d.fill(rimD, PORCELAIN, [0.36, 0.6]);
    const brothD = wobEllipse(BX, RY + 0.8, 40, 7.2, 2191, 0.4);
    const broth = d.fill(brothD, family(3).fill, [0.44, 0.66]);
    const rimLine = d.line(rimD, [0.18, 0.44]);
    const noodles = d.paint(
      svg('g', {}, [
        d.stroke(penWave(46, 2201, 1.5, 3.2), INK_LIGHT, { transform: `translate(${BX - 30},${RY - 2.6})` }),
        d.stroke(penWave(62, 2203, 1.5, 3.2), INK_LIGHT, { transform: `translate(${BX - 34},${RY + 1})` }),
        d.stroke(penWave(42, 2207, 1.4, 3.2), INK_LIGHT, { transform: `translate(${BX - 26},${RY + 4.2})` }),
      ]),
      [0.56, 0.76],
    );
    const egg = d.paint(
      svg('g', {}, [
        svg('path', { d: wobEllipse(BX + 20, RY - 1.5, 7.5, 4.6, 2211, 0.3), fill: PORCELAIN }),
        svg('path', { d: wobCircle(BX + 21, RY - 1.6, 2.7, 2213, { segments: 6, mag: 0.2, cpJitter: 0.4 }), fill: C.yellow }),
        d.stroke(wobEllipse(BX + 20, RY - 1.5, 7.5, 4.6, 2211, 0.3), INK_LIGHT),
      ]),
      [0.62, 0.8],
    );
    const scallion = d.paint(
      svg('g', {}, [[-18, 1.4], [-8, -2.6], [4, 3.2], [-26, -1]].map(([x, y]) => svg('circle', { cx: BX + x, cy: RY + y, r: 1.5, fill: 'oklch(76% 0.11 140)' }))),
      [0.66, 0.82],
    );
    const chopsticks = d.line(`M ${BX + 8},${RY - 3} L ${BX + 54},${RY - 52} M ${BX + 15},${RY - 2} L ${BX + 62},${RY - 46}`, [0.5, 0.7]);

    // Steam rising off it.
    const steam = [0, 1, 2].map((i) =>
      d.line(steamCurl(BX - 22 + i * 15, RY - 14, RY - 60 + (i % 2) * 6, 6, i % 2 ? -1 : 1), [0.72 + i * 0.06, 0.92 + i * 0.03], INK_LIGHT, { opacity: 0.85 }),
    );

    const g = grain(73);
    d.paint(g, [0.14, 0.5]);

    drawIt = d.draw;
    return [
      clip,
      framed(cw, ch, [
        wall,
        frameFill,
        ...paneFills,
        outside,
        ...paneLines,
        frameLine,
        sillFill,
        sillLine,
        ...desk,
        deskGrain,
        ...steam,
        ...foot,
        body,
        band,
        bodyLine,
        rim,
        broth,
        noodles,
        egg,
        scallion,
        rimLine,
        chopsticks,
        g,
      ]),
    ];
  };

  /** Draws the doodle on, p 0 → 1. */
  const draw = (p: number) => drawIt?.(p);
  return { cover, draw };
}

// ── 阿樹's New Year ───────────────────────────────────────────────────

const LANTERN = 'oklch(67% 0.15 31)';
const POT = family(4).tag;
const BROTH = 'oklch(83% 0.085 52)';
const SKIN = 'oklch(91% 0.035 70)';
const HAIR = 'oklch(44% 0.03 60)';

export function resonanceCardCover() {
  let drawIt: ((p: number) => void) | null = null;

  const cover = (cw: number, ch: number, fam: Family): SVGElement[] => {
    const pen = fam.border;
    const d = doodle(pen);

    const wall = d.paint(bleed(fam.fill), [0.14, 0.5]);

    // The red paper lantern, hanging in the corner.
    const LX = 46;
    const LY = 42;
    const string = d.line(`M ${LX},${-B} L ${LX},${LY - 25}`, [0.08, 0.26], INK_LIGHT);
    const capTop = box(LX - 9, LY - 27, 18, 6, 2, 3101, 0.3);
    const capBottom = box(LX - 8, LY + 20, 16, 6, 2, 3103, 0.3);
    const bodyD = wobEllipse(LX, LY, 26, 21, 3107, 0.6);
    const lanternFill = d.fill(bodyD, LANTERN, [0.36, 0.6]);
    const ribs = d.line(
      `M ${LX},${LY - 21} C ${LX - 13},${LY - 12} ${LX - 13},${LY + 12} ${LX},${LY + 21} M ${LX},${LY - 21} C ${LX + 13},${LY - 12} ${LX + 13},${LY + 12} ${LX},${LY + 21}`,
      [0.42, 0.62],
      INK_LIGHT,
    );
    const lanternLine = d.line(bodyD, [0.14, 0.42]);
    const caps = [capTop, capBottom].flatMap((c) => [d.fill(c, C.yellow, [0.42, 0.62]), d.line(c, [0.3, 0.48], INK_LIGHT)]);
    const tassel = d.line(`M ${LX},${LY + 26} L ${LX},${LY + 33} M ${LX - 3.5},${LY + 33} L ${LX - 4},${LY + 44} M ${LX},${LY + 33} L ${LX},${LY + 46} M ${LX + 3.5},${LY + 33} L ${LX + 4},${LY + 44}`, [0.58, 0.76], INK_LIGHT);

    // The table.
    const table = tableTop(d, 146, family(3).tag, 3121, { line: [0.06, 0.34], fill: [0.28, 0.52] });
    const tableGrain = d.line('M 14,164 C 44,163 76,165 104,164 M 150,175 C 182,174 216,176 250,174.5', [0.62, 0.8], INK_LIGHT, { opacity: 0.7 });

    // Steam off the pot (drawn under it, so it rises from inside).
    const PX = 104;
    const RY = 114;
    const steam = [0, 1, 2].map((i) =>
      d.line(steamCurl(PX - 14 + i * 16, RY - 10, RY - 78 + (i % 2) * 10, 7, i % 2 ? -1 : 1), [0.7 + i * 0.06, 0.9 + i * 0.03], INK_LIGHT, { opacity: 0.85 }),
    );

    // The hot pot on its burner: two handles, the broth, fish balls, tofu, a carrot slice, greens.
    const standD = box(PX - 32, 149, 64, 10, 3, 3131, 0.4);
    const stand = [d.fill(standD, family(4).stripe, [0.36, 0.58]), d.line(standD, [0.22, 0.42])];
    const potD = `M ${PX - 58},${RY} C ${PX - 56},${RY + 24} ${PX - 34},${RY + 38} ${PX},${RY + 38} C ${PX + 34},${RY + 38} ${PX + 56},${RY + 24} ${PX + 58},${RY} Z`;
    const pot = d.fill(potD, POT, [0.36, 0.6]);
    const potLine = d.line(potD, [0.12, 0.42]);
    const handles = d.line(
      `M ${PX - 56},${RY + 6} C ${PX - 68},${RY + 4} ${PX - 69},${RY + 17} ${PX - 54},${RY + 17} M ${PX + 56},${RY + 6} C ${PX + 68},${RY + 4} ${PX + 69},${RY + 17} ${PX + 54},${RY + 17}`,
      [0.38, 0.56],
    );
    const rimD = wobEllipse(PX, RY, 58, 11, 3141, 0.5);
    const rim = d.fill(rimD, family(4).fill, [0.38, 0.6]);
    const brothD = wobEllipse(PX, RY + 0.8, 51, 7.8, 3143, 0.4);
    const broth = d.fill(brothD, BROTH, [0.44, 0.66]);
    const rimLine = d.line(rimD, [0.16, 0.44]);
    const leaf = (x: number, y: number, a: number) =>
      svg('g', { transform: `translate(${x},${y}) rotate(${a})` }, [
        svg('path', { d: 'M -6,0 C -3,-4 3,-4 6,0 C 3,4 -3,4 -6,0 Z', fill: 'oklch(80% 0.09 140)' }),
        d.stroke('M -5,0 L 5,0', INK_LIGHT, { opacity: 0.8 }),
      ]);
    const ball = (x: number, y: number, seed: number) => [
      svg('path', { d: wobCircle(x, y, 4.4, seed, { segments: 6, mag: 0.3, cpJitter: 0.4 }), fill: PORCELAIN }),
      d.stroke(wobCircle(x, y, 4.4, seed, { segments: 6, mag: 0.3, cpJitter: 0.4 }), INK_LIGHT),
    ];
    const tofuD = box(PX - 6, RY - 2, 9, 7, 1.5, 3151, 0.2);
    const items = d.paint(
      svg('g', {}, [
        leaf(PX - 34, RY + 1, -12),
        leaf(PX + 33, RY - 1, 18),
        ...ball(PX - 18, RY - 1, 3161),
        ...ball(PX + 15, RY + 2, 3163),
        svg('path', { d: tofuD, fill: PORCELAIN }),
        d.stroke(tofuD, INK_LIGHT),
        svg('path', { d: wobCircle(PX + 2, RY - 4.5, 3.2, 3167, { segments: 6, mag: 0.2, cpJitter: 0.4 }), fill: 'oklch(74% 0.13 45)' }),
      ]),
      [0.58, 0.8],
    );

    // A glass, raised to the call.
    const glassD = `M 175,127 L 191,127 L 189.5,148 L 176.5,148 Z`;
    const glass = [
      d.fill(glassD, PORCELAIN, [0.42, 0.62]),
      d.fill('M 175.7,135 L 190.3,135 L 189.5,148 L 176.5,148 Z', C.yellow, [0.5, 0.68]),
      d.line(glassD, [0.3, 0.5]),
    ];

    // The phone, propped on its stand, the family on the call.
    const PHX = 210;
    const PHY = 56;
    const PHW = 54;
    const PHH = 92;
    const kick = d.line(`M ${PHX + PHW - 10},${PHY + 46} L ${PHX + PHW + 12},${PHY + PHH + 3}`, [0.28, 0.46]);
    const phoneD = box(PHX, PHY, PHW, PHH, 9, 3171, 0.6);
    const screenD = box(PHX + 4, PHY + 9, PHW - 8, PHH - 19, 4, 3173, 0.3);
    const screenClip = uid('call');
    const person = (x: number, top: number, shirt: string, seed: number, bun: boolean) => [
      svg('path', { d: `M ${x - 12},${PHY + PHH} L ${x - 12},${top + 21} C ${x - 11},${top + 14} ${x + 11},${top + 14} ${x + 12},${top + 21} L ${x + 12},${PHY + PHH} Z`, fill: shirt }),
      d.stroke(`M ${x - 12},${top + 22} C ${x - 11},${top + 14} ${x + 11},${top + 14} ${x + 12},${top + 22}`, INK_LIGHT),
      bun ? svg('path', { d: wobCircle(x, top - 6.5, 3.4, seed + 3, { segments: 6, mag: 0.2, cpJitter: 0.4 }), fill: HAIR }) : null,
      svg('path', { d: wobCircle(x, top + 3, 6.6, seed, { segments: 7, mag: 0.3, cpJitter: 0.4 }), fill: SKIN }),
      svg('path', { d: `M ${x - 6.4},${top + 2} C ${x - 6},${top - 5} ${x + 6},${top - 5} ${x + 6.4},${top + 2} C ${x + 3},${top - 1} ${x - 3},${top - 1} ${x - 6.4},${top + 2} Z`, fill: HAIR }),
      d.stroke(wobCircle(x, top + 3, 6.6, seed, { segments: 7, mag: 0.3, cpJitter: 0.4 }), INK_LIGHT),
      d.stroke(`M ${x - 2.2},${top + 6} Q ${x},${top + 7.6} ${x + 2.2},${top + 6}`, INK_LIGHT),
    ].filter((e): e is SVGPathElement => e != null);
    const selfD = box(PHX + PHW - 18, PHY + 13, 10, 14, 2, 3181, 0.2);
    const call = d.paint(
      svg('g', {}, [
        svg('defs', {}, [svg('clipPath', { id: screenClip }, [svg('path', { d: screenD })])]),
        svg('g', { 'clip-path': `url(#${screenClip})` }, [
          ...person(PHX + 18, PHY + 40, family(5).tag, 3191, true),
          ...person(PHX + 37, PHY + 37, family(2).tag, 3197, false),
        ]),
        svg('path', { d: selfD, fill: fam.fill }),
        // 阿樹 in the corner of the call, a small silhouette.
        svg('path', {
          d: `${wobCircle(PHX + PHW - 13, PHY + 19, 2.3, 3183, { segments: 6, mag: 0.1, cpJitter: 0.3 })} M ${PHX + PHW - 17.2},${PHY + 27} C ${PHX + PHW - 17},${PHY + 22.6} ${PHX + PHW - 9},${PHY + 22.6} ${PHX + PHW - 8.8},${PHY + 27} Z`,
          fill: pen,
          opacity: 0.55,
        }),
        d.stroke(selfD, INK_LIGHT),
      ]),
      [0.56, 0.8],
    );
    const phone = svg('g', { transform: `rotate(-6 ${PHX + PHW / 2} ${PHY + PHH})` }, [
      d.fill(phoneD, PORCELAIN, [0.4, 0.62]),
      d.fill(screenD, family(4).fill, [0.44, 0.66]),
      call,
      d.line(screenD, [0.34, 0.54], INK_LIGHT),
      d.line(phoneD, [0.18, 0.46]),
      d.line(`M ${PHX + PHW / 2 - 5},${PHY + 4.5} L ${PHX + PHW / 2 + 5},${PHY + 4.5}`, [0.5, 0.62], INK_LIGHT),
    ]);

    const g = grain(79);
    d.paint(g, [0.14, 0.5]);

    drawIt = d.draw;
    return [
      framed(cw, ch, [
        wall,
        string,
        lanternFill,
        ribs,
        lanternLine,
        ...caps,
        tassel,
        ...table,
        tableGrain,
        ...steam,
        ...stand,
        pot,
        potLine,
        handles,
        rim,
        broth,
        items,
        rimLine,
        ...glass,
        kick,
        phone,
        g,
      ]),
    ];
  };

  /** Draws the doodle on, p 0 → 1. */
  const draw = (p: number) => drawIt?.(p);
  return { cover, draw };
}
