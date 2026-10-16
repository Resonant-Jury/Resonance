/**
 * The cover of the card written in "write" (阿樹's 第一次一個人旅行): a little
 * doodle of the story, the way the app makes a cover from a story's words
 * (lib/ai/tasks: pastel, doodle linework, thick organic outlines, grain) —
 * Hualien's coastal range, the sun, the train along the coast, the sea. Pen
 * lines in the card family's border colour, fills from the site's pastel
 * families, all flat.
 *
 * Left alone it is whole, so a later scene showing the same card passes
 * `cover: myCardCover().cover` to storyCard and gets the identical picture.
 * "write" draws it on with `draw(p)` and rolls the train in with `train(p)`.
 */
import { pointsToBezier, penWave, wavyPoints } from '@/lib/design/wavyPath';
import { drawable, svg } from '../dom';
import { family, INK, INK_LIGHT, makePrng, shapeGrain, wobCircle, wobRect } from '../kit';
import { ease, prog } from '../time';

type Family = ReturnType<typeof family>;

/** The design box the doodle is drawn in (the cover of a 340-wide StoryCard). */
const DW = 296;
const DH = 184;
/** How far the paint runs past the box (storyCard's clip bleeds 22). */
const B = 24;

const SUN = { x: 222, y: 52, r: 22 };
const TRACK_Y = 121;
const SEA_Y = 133;

/** The ridge of the coastal range, left bleed to right bleed. */
const RIDGE =
  `M ${-B},112 C 4,94 38,50 60,48 C 80,46 92,84 108,86 C 122,88 136,64 154,64 ` +
  `C 178,64 204,98 238,104 C 266,109 300,106 ${DW + B},107`;

export function myCardCover() {
  let parts: {
    sky: SVGElement[];
    mountain: { fill: SVGElement; draw: (p: number) => void };
    sun: { fill: SVGElement; draw: (p: number) => void; rays: ((p: number) => void)[] };
    track: (p: number) => void;
    sea: { fill: SVGElement; draw: (p: number) => void };
    waves: ((p: number) => void)[];
    birds: ((p: number) => void)[];
    train: SVGGElement;
  } | null = null;

  const cover = (cw: number, ch: number, fam: Family): SVGElement[] => {
    const pen = fam.border;
    const rnd = makePrng(4211);
    const stroke = (d: string, width: number = INK, extra: Record<string, string | number> = {}) =>
      svg('path', { d, fill: 'none', stroke: pen, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });

    // Sky: the family's own fill, the cover's paper.
    const skyFill = svg('rect', { x: -B, y: -B, width: DW + B * 2, height: DH + B * 2, fill: fam.fill });

    // The sun, with short rays.
    const sunD = wobCircle(SUN.x, SUN.y, SUN.r, 517, { segments: 8, mag: 1.1, cpJitter: 0.5 });
    const sunFill = svg('path', { d: sunD, fill: family(3).fill });
    const sunLine = stroke(sunD);
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = ((i + 0.5) / 8) * Math.PI * 2 + (rnd() - 0.5) * 0.18;
      const r0 = SUN.r + 6 + rnd() * 1.5;
      const r1 = r0 + 6 + rnd() * 2.5;
      const bend = (rnd() - 0.5) * 1.6;
      const [x0, y0] = [SUN.x + Math.cos(a) * r0, SUN.y + Math.sin(a) * r0];
      const [x1, y1] = [SUN.x + Math.cos(a) * r1, SUN.y + Math.sin(a) * r1];
      const [mx, my] = [(x0 + x1) / 2 - Math.sin(a) * bend, (y0 + y1) / 2 + Math.cos(a) * bend];
      return stroke(`M ${x0.toFixed(2)},${y0.toFixed(2)} Q ${mx.toFixed(2)},${my.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`, INK_LIGHT);
    });

    // Two birds over the valley.
    const bird = (x: number, y: number, s: number) =>
      stroke(`M ${x - 5 * s},${y - 1.5 * s} Q ${x - 2.4 * s},${y - 4.2 * s} ${x},${y} Q ${x + 2.4 * s},${y - 4.2 * s} ${x + 5 * s},${y - 1.5 * s}`, INK_LIGHT);
    const birds = [bird(110, 30, 1.4), bird(129, 41, 1.05)];

    // The coastal range: a soft green under its ridge line.
    const mountainFill = svg('path', { d: `${RIDGE} L ${DW + B},${SEA_Y + 6} L ${-B},${SEA_Y + 6} Z`, fill: family(2).tag });
    const ridge = stroke(RIDGE);

    // The railway along the foot of the hills.
    const trackLine = stroke(pointsToBezier(wavyPoints(DW + B * 2, 0, 0.5, 977, 8)), INK_LIGHT, { transform: `translate(${-B},${TRACK_Y})` });

    // The little train, standing at the station (rolled in by `train`).
    const TX = 30;
    const TW = 88;
    const TH = 19;
    const TY = TRACK_Y - 2.6 - TH;
    const bodyD = wobRect(TW, TH, 6.5, 733, 0.9, { segmentsH: 2, segmentsV: 1, curve: 0.9, cornerJitter: 0.8, cornerOffset: 0.8 });
    const windows = Array.from({ length: 4 }, (_, i) => {
      const d = wobRect(11, 7.5, 2.4, 801 + i * 7, 0.45, { segmentsH: 1, segmentsV: 1, curve: 0.8, cornerJitter: 0.6, cornerOffset: 0.3 });
      return [
        svg('path', { d, fill: family(3).fill, transform: `translate(${7 + i * 19.5},${4})` }),
        stroke(d, INK_LIGHT, { transform: `translate(${7 + i * 19.5},${4})` }),
      ];
    }).flat();
    const wheels = [12, 30, 58, 76].map((x, i) => {
      const d = wobCircle(x, TH + 0.6, 2.4, 911 + i, { segments: 6, mag: 0.25, cpJitter: 0.4 });
      return [svg('path', { d, fill: pen }), stroke(d, INK_LIGHT)];
    }).flat();
    const train = svg('g', {}, [
      svg('g', { transform: `translate(${TX},${TY})` }, [
        svg('path', { d: bodyD, fill: fam.interior }),
        stroke(`M 4,${TH - 4.5} C ${TW * 0.3},${TH - 4} ${TW * 0.7},${TH - 5} ${TW - 4},${TH - 4.5}`, INK_LIGHT),
        ...windows,
        stroke(bodyD),
        ...wheels,
      ]),
    ]);

    // The sea, its horizon a pen line, a few waves on it.
    const seaEdge = pointsToBezier(wavyPoints(DW + B * 2, 0, 1.1, 1213, 9));
    const seaFill = svg('path', { d: `${seaEdge} L ${DW + B * 2},${DH + B * 2} L 0,${DH + B * 2} Z`, fill: family(4).tag, transform: `translate(${-B},${SEA_Y})` });
    const seaLine = stroke(seaEdge, INK, { transform: `translate(${-B},${SEA_Y})` });
    const waveSpots: [number, number, number][] = [[34, 152, 30], [120, 146, 26], [206, 156, 30], [74, 172, 24], [258, 174, 22]];
    const waves = waveSpots.map(([x, y, w], i) => stroke(penWave(w, 1301 + i * 17, 1.7, 6.5), INK_LIGHT, { transform: `translate(${x},${y})` }));

    // Riso grain over the whole picture, as a doodle cover carries.
    const grain = svg('rect', { x: -B, y: -B, width: DW + B * 2, height: DH + B * 2, fill: 'black', filter: shapeGrain(0.14, 0.95, 61) });

    const sx = cw / DW;
    const sy = ch / DH;
    const g = svg('g', { transform: sx === 1 && sy === 1 ? undefined : `scale(${sx.toFixed(4)},${sy.toFixed(4)})` }, [
      skyFill,
      sunFill,
      sunLine,
      ...rays,
      ...birds,
      mountainFill,
      ridge,
      trackLine,
      train,
      seaFill,
      seaLine,
      ...waves,
      grain,
    ]);

    parts = {
      sky: [skyFill, grain],
      mountain: { fill: mountainFill, draw: drawable(ridge) },
      sun: { fill: sunFill, draw: drawable(sunLine), rays: rays.map(drawable) },
      track: drawable(trackLine),
      sea: { fill: seaFill, draw: drawable(seaLine) },
      waves: waves.map(drawable),
      birds: birds.map(drawable),
      train,
    };
    return [g];
  };

  const fade = (el: SVGElement, p: number) => {
    el.style.opacity = p.toFixed(3);
  };

  /** Draws the doodle on, p 0 → 1: the sky, the horizon, the hills, the sun and the shore, their colours, then the waves and birds. */
  const draw = (p: number) => {
    if (!parts) return;
    const k = (a: number, b: number, e = ease.inOutCubic) => e(prog(p, a, b));
    parts.sky.forEach((el) => fade(el, k(0, 0.2, ease.outCubic)));
    parts.sea.draw(k(0.04, 0.34));
    parts.mountain.draw(k(0.12, 0.46));
    parts.sun.draw(k(0.22, 0.48));
    parts.track(k(0.32, 0.52));
    fade(parts.mountain.fill, k(0.34, 0.6, ease.outCubic));
    fade(parts.sea.fill, k(0.4, 0.66, ease.outCubic));
    fade(parts.sun.fill, k(0.44, 0.66, ease.outCubic));
    parts.sun.rays.forEach((d, i) => d(k(0.5 + i * 0.024, 0.64 + i * 0.024, ease.outCubic)));
    parts.waves.forEach((d, i) => d(k(0.6 + i * 0.05, 0.78 + i * 0.05, ease.outCubic)));
    parts.birds.forEach((d, i) => d(k(0.8 + i * 0.06, 0.94 + i * 0.06, ease.outCubic)));
  };

  /** The train's run in from the left to the station, p 0 → 1 (1: standing where the picture keeps it). */
  const train = (p: number) => {
    if (!parts) return;
    const e = ease.outCubic(Math.max(0, Math.min(1, p)));
    const x = -(30 + 88 + B + 8) * (1 - e);
    parts.train.setAttribute('transform', x === 0 ? '' : `translate(${x.toFixed(2)},0)`);
  };

  return { cover, draw, train };
}
