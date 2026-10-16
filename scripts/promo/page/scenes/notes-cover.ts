/**
 * The cover of 晴天's card in "notes" (凌晨四點的便利商店): a little doodle of
 * the story, the way the app makes a cover from a story's words (pastel,
 * doodle linework, thick organic outlines, grain) — a convenience store lit
 * at night, a cup of hot milk tea steaming in front of it, a crescent moon
 * and a few stars. Pen lines in the card family's border colour, fills from
 * the site's pastel families, all flat.
 *
 * The picture fills its box the way an image with `object-fit: cover` does:
 * on the card (296 × 184) it is whole, and on the thread's quoted card (1.91:1)
 * a strip comes off the top and the bottom, so nothing that matters sits
 * there. `sway(t)` lets the steam waver, every copy of the picture alike.
 */
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { svg } from '../dom';
import { family, INK, INK_LIGHT, makePrng, shapeGrain, wobCircle, wobRect } from '../kit';
import { drift } from '../time';

type Family = ReturnType<typeof family>;

/** The design box (the cover of a 340-wide StoryCard). */
const DW = 296;
const DH = 184;
/** How far the paint runs past the box (storyCard's clip bleeds 22). */
const B = 24;

const GROUND_Y = 148;

/** Night, in the site's pastels: a dusky periwinkle sky, the street a shade deeper, the shop's light a warm straw. */
const SKY = 'oklch(80% 0.045 262)';
const GROUND = 'oklch(74.5% 0.036 258)';
const LIGHT = 'oklch(95.5% 0.07 92)';
const WALL = 'oklch(92.5% 0.016 235)';
const SIGN = 'oklch(96.5% 0.012 85)';
const CUP = 'oklch(97% 0.01 80)';
const SLEEVE = 'oklch(83% 0.06 62)';
const LID = 'oklch(91% 0.016 70)';

/** A crescent moon: the circle (cx, cy, r) less a circle a little toward `ang`, as sampled points. */
function crescent(cx: number, cy: number, r: number, ang: number, off = 0.52, k = 0.8): string {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const d = r * off;
  const r2 = r * k;
  const ix = cx + ux * d;
  const iy = cy + uy * d;
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const px = cx + ux * a;
  const py = cy + uy * a;
  const p1: [number, number] = [px - uy * h, py + ux * h];
  const p2: [number, number] = [px + uy * h, py - ux * h];
  const TAU = Math.PI * 2;
  const norm = (x: number) => ((x % TAU) + TAU) % TAU;
  /** The arc of a circle from angle a0 to a1 that passes through angle `via`. */
  const arc = (ox: number, oy: number, rr: number, a0: number, a1: number, via: number, n: number) => {
    const span = norm(a1 - a0);
    const delta = norm(via - a0) <= span ? span : span - TAU;
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = a0 + (delta * i) / n;
      return [ox + Math.cos(t) * rr, oy + Math.sin(t) * rr] as [number, number];
    });
  };
  const outer = arc(cx, cy, r, Math.atan2(p1[1] - cy, p1[0] - cx), Math.atan2(p2[1] - cy, p2[0] - cx), ang + Math.PI, 26);
  const inner = arc(ix, iy, r2, Math.atan2(p2[1] - iy, p2[0] - ix), Math.atan2(p1[1] - iy, p1[0] - ix), ang + Math.PI, 18);
  const pts = [...outer, ...inner.slice(1)];
  return `M ${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')} Z`;
}

/** A four-pointed twinkle centred on (x, y). */
function twinkle(x: number, y: number, s: number): string {
  const q = s * 0.16;
  return `M ${x},${y - s} Q ${x + q},${y - q} ${x + s},${y} Q ${x + q},${y + q} ${x},${y + s} Q ${x - q},${y + q} ${x - s},${y} Q ${x - q},${y - q} ${x},${y - s} Z`;
}

/** A wisp of steam rising from (x, y0) to y1, swaying `a` px either side. */
function wisp(x: number, y0: number, y1: number, a: number, flip: number): string {
  const h = y0 - y1;
  const p = (k: number, dx: number) => `${(x + dx * flip).toFixed(2)},${(y0 - h * k).toFixed(2)}`;
  return `M ${p(0, 0)} C ${p(0.14, a)} ${p(0.26, a)} ${p(0.36, 0)} C ${p(0.46, -a)} ${p(0.58, -a)} ${p(0.68, 0)} C ${p(0.78, a * 0.8)} ${p(0.9, a * 0.6)} ${p(1, 0)}`;
}

export function notesCardCover() {
  const wisps: SVGElement[][] = [];

  const cover = (cw: number, ch: number, fam: Family): SVGElement[] => {
    const pen = fam.border;
    const rnd = makePrng(5309);
    const stroke = (d: string, width: number = INK, extra: Record<string, string | number> = {}) =>
      svg('path', { d, fill: 'none', stroke: pen, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
    const shape = (d: string, fill: string, width: number = INK) => [svg('path', { d, fill }), stroke(d, width)];

    // The night sky, its moon and stars.
    const sky = svg('rect', { x: -B, y: -B, width: DW + B * 2, height: DH + B * 2, fill: SKY });
    const moon = shape(crescent(100, 34, 13, -0.62), LIGHT);
    const stars = ([[20, 30, 4.6], [148, 25, 3.8], [190, 33, 3], [234, 22, 4.3], [272, 37, 3.2]] as const).flatMap(([x, y, s]) =>
      shape(twinkle(x + (rnd() - 0.5) * 0.6, y, s), LIGHT, INK_LIGHT),
    );
    const specks = ([[78, 20], [128, 41], [212, 42], [30, 62], [288, 20], [166, 46]] as const).map(([x, y]) =>
      svg('path', { d: wobCircle(x, y, 1.3, 1400 + x, { segments: 5, mag: 0.15, cpJitter: 0.3 }), fill: LIGHT }),
    );

    // The street, and the shop's light spilling across it.
    const ground = svg('rect', { x: -B, y: GROUND_Y, width: DW + B * 2, height: DH - GROUND_Y + B, fill: GROUND });
    const spill = svg('path', { d: `M 134,${GROUND_Y} L 280,${GROUND_Y} L ${DW + B},${DH + B} L 72,${DH + B} Z`, fill: LIGHT, opacity: 0.55 });
    const kerb = stroke(pointsToBezier(wavyPoints(DW + B * 2, 0, 0.5, 2203, 8)), INK_LIGHT, { transform: `translate(${-B},${GROUND_Y})` });

    // The shop: its wall, the sign with its three stripes, two lit windows with shelves, a lit door.
    const wallD = wobRect(156, GROUND_Y - 66 + 2, 3, 3101, 0.9, { segmentsH: 3, segmentsV: 2, curve: 0.8, cornerJitter: 0.6, cornerOffset: 0.6 });
    const wall = svg('g', { transform: 'translate(126,66)' }, shape(wallD, WALL));
    const signD = wobRect(168, 23, 4, 3203, 0.8, { segmentsH: 3, segmentsV: 1, curve: 0.8, cornerJitter: 0.6, cornerOffset: 0.5 });
    const stripes = (['oklch(80% 0.09 52)', 'oklch(82% 0.075 145)', 'oklch(79% 0.075 20)'] as const).map((fill, i) =>
      svg('rect', { x: 3, y: 9 + i * 3.6, width: 162, height: 3.6, fill }),
    );
    const sign = svg('g', { transform: 'translate(120,47)' }, [svg('path', { d: signD, fill: SIGN }), ...stripes, stroke(signD)]);

    const pane = (x: number, y: number, w: number, h: number, seed: number, shelves: number[]) => {
      const d = wobRect(w, h, 3, seed, 0.7, { segmentsH: 2, segmentsV: 2, curve: 0.8, cornerJitter: 0.6, cornerOffset: 0.4 });
      const goods = shelves.flatMap((sy) => {
        let gx = 4 + rnd() * 2;
        const out: SVGElement[] = [];
        while (gx < w - 9) {
          const gw = 4.5 + rnd() * 3;
          const gh = 5 + rnd() * 4.5;
          const fill = [family(0).fill, family(2).tag, family(5).tag, family(1).tag, family(4).tag][Math.floor(rnd() * 5)];
          out.push(svg('rect', { x: gx, y: sy - gh, width: gw, height: gh, rx: 1.2, fill }));
          gx += gw + 2 + rnd() * 2.5;
        }
        return [...out, stroke(`M 2.5,${sy} C ${w * 0.35},${sy + 0.6} ${w * 0.65},${sy - 0.5} ${w - 2.5},${sy + 0.2}`, INK_LIGHT, { opacity: 0.75 })];
      });
      return svg('g', { transform: `translate(${x},${y})` }, [svg('path', { d, fill: LIGHT }), ...goods, stroke(d, INK_LIGHT)]);
    };
    const leftWindow = pane(136, 80, 50, 52, 3307, [21, 39]);
    const rightWindow = pane(230, 80, 44, 52, 3409, [21, 39]);
    const doorD = wobRect(28, GROUND_Y - 82, 2.5, 3511, 0.6, { segmentsH: 1, segmentsV: 2, curve: 0.8, cornerJitter: 0.5, cornerOffset: 0.3 });
    const door = svg('g', { transform: 'translate(194,82)' }, [
      svg('path', { d: doorD, fill: LIGHT }),
      stroke('M 5,30 C 5.2,34 5,38 5.2,42', INK_LIGHT),
      stroke(doorD, INK_LIGHT),
    ]);
    const sill = stroke(`M 128,135 C 160,134.4 200,135.6 280,134.8`, INK_LIGHT, { opacity: 0.6 });

    // The cup of hot milk tea in front: lid, paper cup, sleeve, and its steam.
    const cupX = 58;
    const top = 101;
    const bottom = 160;
    const sideAt = (y: number) => 19 - ((y - top) / (bottom - top)) * 6;
    const body = `M ${cupX - 19},${top} C ${cupX - 17.6},${top + 20} ${cupX - 15.4},${bottom - 18} ${cupX - 13.2},${bottom - 1} ` +
      `C ${cupX - 4},${bottom + 0.8} ${cupX + 5},${bottom + 0.6} ${cupX + 13.2},${bottom - 1} ` +
      `C ${cupX + 15.2},${bottom - 18} ${cupX + 17.4},${top + 20} ${cupX + 19},${top} Z`;
    const s0 = 118;
    const s1 = 140;
    const sleeve = `M ${cupX - sideAt(s0)},${s0} C ${cupX - 6},${s0 + 1.2} ${cupX + 6},${s0 - 0.6} ${cupX + sideAt(s0)},${s0} ` +
      `L ${cupX + sideAt(s1)},${s1} C ${cupX + 6},${s1 + 0.8} ${cupX - 6},${s1 - 0.4} ${cupX - sideAt(s1)},${s1} Z`;
    const lidD = wobRect(48, 9, 3.5, 3613, 0.5, { segmentsH: 2, segmentsV: 1, curve: 0.9, cornerJitter: 0.5, cornerOffset: 0.3 });
    const domeD = `M ${cupX - 16},93 C ${cupX - 13},86.5 ${cupX + 13},86.2 ${cupX + 16},93 Z`;
    const cup = svg('g', {}, [
      ...shape(body, CUP),
      ...shape(sleeve, SLEEVE, INK_LIGHT),
      ...shape(domeD, LID, INK_LIGHT),
      svg('g', { transform: `translate(${cupX - 24},92)` }, shape(lidD, LID)),
    ]);
    const steam = [
      stroke(wisp(cupX - 9, 84, 50, 3.6, 1), INK_LIGHT),
      stroke(wisp(cupX + 1, 82, 40, 4.2, -1), INK_LIGHT),
      stroke(wisp(cupX + 11, 84, 52, 3.4, 1), INK_LIGHT),
    ];
    wisps.push(steam);

    // Riso grain over the whole picture, as a doodle cover carries.
    const grain = svg('rect', { x: -B, y: -B, width: DW + B * 2, height: DH + B * 2, fill: 'black', filter: shapeGrain(0.14, 0.95, 67) });

    // Fill the box as `object-fit: cover` would: scaled evenly, centred, the overflow cut by the box.
    const s = Math.max(cw / DW, ch / DH);
    const tx = (cw - DW * s) / 2;
    const ty = (ch - DH * s) / 2;
    const g = svg('g', { transform: s === 1 && tx === 0 && ty === 0 ? undefined : `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(4)})` }, [
      sky,
      ...specks,
      ...stars,
      ...moon,
      ground,
      spill,
      kerb,
      wall,
      sign,
      leftWindow,
      rightWindow,
      door,
      sill,
      cup,
      ...steam,
      grain,
    ]);
    return [g];
  };

  /** The steam's slow waver (local seconds): each wisp drifts a little and breathes. */
  const sway = (t: number) => {
    wisps.forEach((ws) =>
      ws.forEach((w, i) => {
        w.setAttribute('transform', `translate(${(drift(t, 2.6 + i * 0.4, i * 0.37) * 1.1).toFixed(2)},${(-drift(t, 3.4, i * 0.21) * 0.8).toFixed(2)})`);
        w.setAttribute('opacity', (0.78 + 0.22 * drift(t, 2.2 + i * 0.3, 0.15 + i * 0.4)).toFixed(3));
      }),
    );
  };

  return { cover, sway };
}
