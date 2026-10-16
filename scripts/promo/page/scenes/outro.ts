/**
 * 58.0 – 66.0 s. The landing page's closing band: a sheet of plain paper
 * wipes the thought map clean (by 0.6 s, when the map scene ends), then the
 * terracotta band rises with SectionEdge's wavy top (seed 137) and its
 * cream-dark lip, its two pale blobs riding up with it. As soon as the band
 * covers the words' place the pen starts on the brand mark; then, in cream:
 * the wordmark, the hero's line 讓生命影響生命 (its accent carried by a
 * terracotta-light squiggle drawn under it), the tagline, the address on a
 * ctaLight button beside the stores' own badges, and where it runs. A long
 * hold; then the words lift away and the band sinks back down the way it
 * came, its wave and lip descending, until only plain cream paper is left —
 * the intro's first frame, so the film loops without a seam.
 */
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { badgeArt, badgeGeometry, type Store } from '@/components/molecules/GetTheApp/badges';
import { css, drawable, html, place, svg } from '../dom';
import { blob, SQUIGGLE } from '../decor';
import { button, C, ICONS, INK, INK_LIGHT, INK_STRONG, measure } from '../kit';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { drift, ease, lerp, prog, spring } from '../time';

const W = 1920;
const H = 1080;
/** The CTA band's blobs (CTASection): oklch(98% 0.01 75), OrganiBlob's default grain. */
const BLOB_FILL = 'oklch(98% 0.01 75)';
/** The tagline and the platforms: cream a step under the headline's, still clear on the band. */
const CREAM_90 = `color-mix(in oklch, ${C.cream} 90%, transparent)`;
/**
 * The whole headline is full-contrast cream; the accent word is carried by
 * its squiggle, a cream pen line of about half the letters' stem weight on screen.
 */
const SQUIGGLE_COLOR = C.cream;
const SQUIGGLE_WIDTH = 4.5;
/** Where a band's wave rests once it has risen: just above the stage, so its bulges never show. */
const REST = -34;
/** Below the stage, with room for the wave's crests. */
const FROM = H + 40;
/** The cream-dark lip riding above the band's wave. */
const LIP = 84;
/** The words start lifting away (local seconds); the band then sinks back down over SINK, plain paper before the scene's end at 8.0. */
const LIFT_AT = 6.7;
const SINK_AT = 7.08;
const SINK = 0.9;

/**
 * SectionEdge's wave (a 1440 × h canvas stretched to the stage's width, as a
 * 1920-wide browser draws it), around y = 0.
 */
function edgePoints(seed: number, h: number, amplitude: number, steps: number): [number, number][] {
  const base = h * 0.78;
  return wavyPoints(1440, base, h * amplitude, seed, steps).map(([x, y]) => [(x * W) / 1440, y - base]);
}

/** A band whose top is the wave, filled down past the stage's foot. */
function bandFill(pts: [number, number][]): string {
  return `${pointsToBezier(pts)} L ${W},${H + 240} L 0,${H + 240} Z`;
}

export const outro: Scene = {
  id: 'outro',
  ...TIMELINE.outro,
  fadeIn: 0,
  build({ copy, locale }) {
    // Transparent until the bands cover the map scene under it.
    const root = html('div', { class: 'scene' });

    // ── The rising bands ────────────────────────────────────────────
    // First a sheet of plain paper, its edge a pen wave (the header's rule):
    // it wipes the map clean before the map scene ends at 0.6 s.
    const sheetPts = edgePoints(211, 100, 0.16, 12);
    const sheet = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'abs', style: 'left:0;top:0;overflow:visible' }, [
      svg('path', { d: bandFill(sheetPts), fill: C.cream }),
      svg('path', { d: pointsToBezier(sheetPts), fill: 'none', stroke: 'oklch(55% 0.05 60 / 0.38)', 'stroke-width': INK_LIGHT, 'stroke-linecap': 'round' }),
    ]);
    // Then the band: SectionEdge seed 137 / h 100 / amplitude 0.13 / 14 steps,
    // with the cream-dark of the section above it (SectionEdge's topColor) as its lip.
    const bandPts = edgePoints(137, 100, 0.13, 14);
    const lipPts = edgePoints(173, 100, 0.12, 12).map(([x, y]): [number, number] => [x, y - LIP]);
    const bandShape = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'abs', style: `left:0;top:${REST}px;overflow:visible` }, [
      svg('path', { d: bandFill(lipPts), fill: C.creamDark }),
      svg('path', { d: bandFill(bandPts), fill: C.terracotta }),
      svg('path', { d: pointsToBezier(bandPts), fill: 'none', stroke: 'oklch(40% 0.12 45 / 0.35)', 'stroke-width': INK_LIGHT, 'stroke-linecap': 'round' }),
    ]);
    // The band's two blobs, placed where they rest once the band has risen (it carries them up).
    const blobs = [
      { el: blob(2, 420, BLOB_FILL, 0.4), x: 70, y: 60, r: 38, opacity: 0.15, period: 14, phase: 0.2 },
      { el: blob(0, 340, BLOB_FILL, 0.4), x: W - 340 - 130, y: H - 340 - 40, r: -12, opacity: 0.12, period: 17, phase: 1.1 },
    ];
    const band = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H } }, [bandShape, ...blobs.map((b) => b.el)]);
    root.append(sheet, band);

    // ── The words on the band ───────────────────────────────────────
    // Lockup: the header's, scaled (mark 1.75 × the wordmark's size), in cream.
    const WORD = 64;
    const mark = svg(
      'svg',
      { width: WORD * 1.75, height: WORD * 1.75, viewBox: '0 0 24 24', fill: 'none', stroke: C.cream, 'stroke-width': INK, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'display:block;overflow:visible' },
      ICONS.wave.d.map((d) => svg('path', { d })),
    );
    const markDraw = [...mark.querySelectorAll('path')].map((p) => drawable(p));
    const word = html('span', { text: 'Resonance', style: { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: WORD, lineHeight: 1, letterSpacing: '-0.02em', color: C.cream } });
    const lockup = html('div', { style: { display: 'flex', alignItems: 'center', gap: Math.round((10 * WORD) / 24) } }, [mark, word]);

    // The hero's line, its accent squiggled (viewBox 200 × 12, meet: on a word wider than its box it stays its width, centred).
    // The squiggle sits a little lower than the hero's, clear of the cream letters now that it is another colour.
    const HEAD = 88;
    const k = HEAD / 76;
    const SQ_H = 12 * k;
    const squigglePath = svg('path', { d: SQUIGGLE, fill: 'none', stroke: SQUIGGLE_COLOR, 'stroke-width': INK_STRONG, 'stroke-linecap': 'round' });
    const squiggle = svg('svg', { viewBox: '0 0 200 12', class: 'abs', style: `left:0;bottom:${-12 * k}px;width:100%;height:${SQ_H}px;overflow:visible` }, [squigglePath]);
    const drawSquiggle = drawable(squigglePath);
    const part = (text: string, extra: SVGElement | null = null) =>
      html('span', { style: { position: 'relative', display: 'inline-block', whiteSpace: 'pre', color: C.cream } }, [text, extra]);
    const parts = [part(copy.ui.heroPrefix), part(copy.ui.heroAccent, squiggle), part(copy.ui.heroSuffix)];
    const headline = html('h1', {
      style: { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: HEAD, lineHeight: 1.08, letterSpacing: '-0.03em', color: C.cream, whiteSpace: 'nowrap', marginTop: 52 },
    }, parts);

    const tagline = html('p', {
      text: copy.narration.introTagline.join(''),
      style: { fontFamily: 'var(--font-body)', fontSize: 32, lineHeight: 1.5, color: CREAM_90, letterSpacing: locale === 'en' ? '0.01em' : '0.08em', marginTop: 26 },
    });

    // The call to action: the address on the closing band's light button, then the stores' badges at one visible height.
    const ZOOM = 1.5;
    const cta = button(copy.narration.outro.url, 'ctaLight', { size: 'md', icon: 'globe', iconSize: 17 });
    const ctaIcon = cta.el.querySelector<SVGSVGElement>(':scope > svg:not(.abs)');
    const ctaIconDraw = ctaIcon ? [...ctaIcon.querySelectorAll('path')].map((p) => drawable(p)) : [];
    const ctaWrap = html('div', { style: { zoom: ZOOM, display: 'flex' } }, [cta.el]);
    const ctaOuter = html('div', { style: { display: 'flex' } }, [ctaWrap]);
    const BADGE_H = Math.round(cta.h * ZOOM);
    const badges = (['appStore', 'googlePlay'] as Store[]).map((store) => {
      const art = badgeArt(store, locale);
      const g = badgeGeometry(art);
      const img = html('img', {
        attrs: { src: art.src, alt: '', width: art.width, height: art.height, decoding: 'sync' },
        style: { position: 'absolute', left: -BADGE_H * g.offsetX, top: -BADGE_H * g.offsetY, width: BADGE_H * g.imageWidth, height: BADGE_H * g.imageHeight, maxWidth: 'none' },
      });
      return html('div', { style: { position: 'relative', flex: 'none', width: BADGE_H * g.boxWidth, height: BADGE_H } }, [img]);
    });
    const badgeRow = html('div', { style: { display: 'flex', alignItems: 'center', gap: Math.round(BADGE_H * 0.32) } }, badges);
    const ctaRow = html('div', { style: { display: 'flex', alignItems: 'center', gap: 34, marginTop: 58 } }, [ctaOuter, badgeRow]);

    const platforms = html('p', {
      text: copy.narration.outro.platforms,
      style: { fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 500, lineHeight: 1.4, color: CREAM_90, letterSpacing: '0.05em', marginTop: 30 },
    });

    const words = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' } }, [
      lockup,
      headline,
      tagline,
      ctaRow,
      platforms,
    ]);
    const { h: wordsH } = measure(words);
    css(words, { top: Math.round((H - wordsH) / 2 - 12) });
    // The squiggle's stroke, in its viewBox's units, for SQUIGGLE_WIDTH px on screen whatever the accent's width.
    const accentW = parts[1].getBoundingClientRect().width;
    const sqScale = Math.min(accentW / 200, SQ_H / 12);
    squigglePath.setAttribute('stroke-width', (SQUIGGLE_WIDTH / sqScale).toFixed(3));
    root.append(words);

    // The band rises (and, at the end, sinks back down) between REST and SUNK: low enough that the lip's crests clear the stage's foot.
    const SUNK = FROM + LIP;
    const sheetTop = (t: number) => lerp(FROM, REST, ease.inOutCubic(prog(t, 0, 0.6)));
    const bandTop = (t: number) =>
      lerp(SUNK, REST, ease.inOutCubic(prog(t, 0.06, 1.0))) + (SUNK - REST) * ease.inOutCubic(prog(t, SINK_AT, SINK_AT + SINK));

    const update = (t: number) => {
      place(sheet, { y: sheetTop(t), opacity: t < 1.05 ? 1 : 0 });
      place(band, { y: bandTop(t) - REST });

      blobs.forEach((b, i) => {
        const settle = ease.outCubic(prog(t, 0.2 + i * 0.1, 1.4 + i * 0.1));
        place(b.el, {
          x: b.x + drift(t, b.period, b.phase) * 26,
          y: b.y + drift(t, b.period * 1.3, b.phase + 0.5) * 18 + (1 - settle) * 60,
          r: b.r + drift(t, b.period * 2, b.phase) * 7,
          s: 0.92 + 0.08 * settle,
          opacity: b.opacity,
        });
      });

      // The words lift away one line after another, top first, before the band goes back down.
      const away = (i: number) => ease.inOutCubic(prog(t, LIFT_AT + i * 0.06, LIFT_AT + i * 0.06 + 0.5));
      const lift = (i: number) => -40 * away(i);
      const stay = (i: number) => 1 - away(i);

      // Lockup: the pen starts on the mark as soon as the band covers its place; the wordmark slides in beside it.
      markDraw.forEach((draw, i) => draw(ease.inOutCubic(prog(t, 0.62 + i * 0.12, 1.12 + i * 0.12))));
      const wp = ease.outCubic(prog(t, 0.76, 1.4));
      // ResonanceIcon's own 7% drop, which balances the mark against the wordmark.
      place(mark, { y: WORD * 1.75 * 0.07 + lift(0), opacity: stay(0) });
      place(word, { x: (1 - wp) * -18, y: lift(0), opacity: wp * stay(0) });

      // Headline: its three pieces rise in one after another; the squiggle is drawn under the accent.
      parts.forEach((el, i) => {
        const p = ease.outCubic(prog(t, 0.96 + i * 0.1, 1.6 + i * 0.1));
        place(el, { y: (1 - p) * 30 + lift(1), opacity: p * stay(1) });
      });
      drawSquiggle(ease.inOutCubic(prog(t, 1.5, 2.15)));

      const sp = ease.outCubic(prog(t, 1.6, 2.2));
      place(tagline, { y: (1 - sp) * 20 + lift(2), opacity: sp * stay(2) });

      // The address, then each badge, set down with a small spring.
      const pieces = [ctaOuter, ...badges];
      pieces.forEach((el, i) => {
        const a = 1.95 + i * 0.13;
        const o = ease.outCubic(prog(t, a, a + 0.45));
        const s = spring(t, a, 0.75, 0.16);
        place(el, { y: (1 - s) * 24 + lift(3), s: 0.94 + 0.06 * s, opacity: o * stay(3) });
      });
      ctaIconDraw.forEach((draw, i) => draw(ease.inOutCubic(prog(t, 2.01 + i * 0.1, 2.51 + i * 0.1))));

      const pp = ease.outCubic(prog(t, 2.4, 2.95));
      place(platforms, { y: (1 - pp) * 14 + lift(4), opacity: pp * stay(4) });
    };
    return { root, update };
  },
};
