/**
 * The tour's header, over the feature scenes: the site header's brand lockup
 * on the left (wave mark 42 + "Resonance" in Playfair 24) and the chapters on
 * the right, the current one in deep terracotta over a pen-wave underline,
 * all above the header's own wavy rule.
 */
import { penWave, wavyPoints, pointsToBezier } from '@/lib/design/wavyPath';
import { drawable, html, place, svg } from './dom';
import { C, ICONS, INK_LIGHT, INK, measure } from './kit';
import type { Copy } from './copy';
import { CHAPTERS, TIMELINE } from './timeline';
import { clamp, ease, prog } from './time';

const PAD_X = 120;

export function header(copy: Copy) {
  const mark = svg(
    'svg',
    { width: 42, height: 42, viewBox: '0 0 24 24', fill: 'none', stroke: C.terracotta, 'stroke-width': INK, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'display:block;transform:translateY(7%)' },
    ICONS.wave.d.map((d) => svg('path', { d })),
  );
  const word = html('span', { text: 'Resonance', style: { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', color: C.text } });
  const brand = html('div', { class: 'abs', style: { left: PAD_X, top: 20, display: 'flex', alignItems: 'center', gap: 10 } }, [mark, word]);

  const labels = copy.narration.chapters.map((name, i) => {
    const num = html('span', { text: String(i + 1).padStart(2, '0'), style: { fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', marginRight: 8, fontVariantNumeric: 'tabular-nums' } });
    const text = html('span', { text: name });
    const el = html('div', { style: { position: 'relative', display: 'inline-flex', alignItems: 'baseline', fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap' } }, [num, text]);
    return { el };
  });
  const nav = html('div', { class: 'abs', style: { right: PAD_X, top: 31, display: 'flex', gap: 34 } }, labels.map((l) => l.el));
  const root = html('div', { class: 'layer', style: { zIndex: 30 } }, [brand, nav]);
  measure(root);

  // A pen-wave under each chapter's name, drawn while it is the current one.
  const unders = labels.map((l, i) => {
    const w = Math.ceil(l.el.getBoundingClientRect().width);
    const d = penWave(w, 41 + i * 7, 1.3, 5);
    const path = svg('path', { d, fill: 'none', stroke: C.terracotta, 'stroke-width': INK, 'stroke-linecap': 'round' });
    const s = svg('svg', { width: w, height: 8, viewBox: `0 -4 ${w} 8`, class: 'abs', style: 'left:0;bottom:-12px;overflow:visible' }, [path]);
    l.el.append(s);
    return drawable(path);
  });

  // The header's wavy rule (wavyPoints 1440, seed 211, 12 steps), stretched across the stage.
  const rule = svg('svg', { width: 1920, height: 14, viewBox: '0 0 1440 14', preserveAspectRatio: 'none', class: 'abs', style: 'left:0;top:68px;overflow:visible' }, [
    svg('path', { d: pointsToBezier(wavyPoints(1440, 7, 1.4, 211, 12)), fill: 'none', stroke: 'oklch(55% 0.05 60 / 0.38)', 'stroke-width': INK_LIGHT, 'vector-effect': 'non-scaling-stroke' }),
  ]);
  root.append(rule);

  const first = TIMELINE[CHAPTERS[0]].start;
  const last = TIMELINE[CHAPTERS[CHAPTERS.length - 1]].end;
  const markPaths = [...mark.querySelectorAll('path')].map((p) => drawable(p));
  const { width: bw, height: bh } = brand.getBoundingClientRect();
  const BIG = 3.1667; // mark 42 → 133, wordmark 24 → 76
  /** The brand's pose: centred big on the intro's paper, then carried up into the header. */
  const pose = (t: number) => {
    const rise = ease.inOutCubic(prog(t, 1.85, 2.55));
    const cy = 470 - 90 * rise;
    const fly = ease.inOutCubic(prog(t, 5.95, 6.85));
    const s = BIG + (1 - BIG) * fly;
    const x = (960 - (bw * BIG) / 2 - PAD_X) * (1 - fly);
    const y = (cy - (bh * BIG) / 2 - 20) * (1 - fly);
    return { x, y, s };
  };

  const update = (t: number) => {
    const shown = Math.min(ease.outCubic(prog(t, first + 0.2, first + 1.0)), 1 - ease.inCubic(prog(t, last - 0.35, last - 0.03)));
    place(nav, { y: (1 - shown) * -16, opacity: shown });
    place(rule, { opacity: shown });

    const p = pose(t);
    const gone = ease.inCubic(prog(t, last - 0.35, last - 0.03));
    place(brand, { x: p.x, y: p.y - gone * 16, s: p.s, opacity: 1 - gone, origin: '0 0' });
    markPaths.forEach((draw, i) => draw(ease.inOutCubic(prog(t, 0.3 + i * 0.22, 1.1 + i * 0.22))));
    const wp = ease.outCubic(prog(t, 0.95, 1.75));
    place(word, { x: (1 - wp) * -14, opacity: wp });

    CHAPTERS.forEach((id, i) => {
      const { start, end } = TIMELINE[id];
      const on = Math.min(ease.inOutCubic(prog(t, start + 0.3, start + 0.8)), 1 - ease.inOutCubic(prog(t, end - 0.5, end)));
      labels[i].el.style.color = `color-mix(in oklch, ${C.onTonal} ${Math.round(on * 100)}%, color-mix(in oklch, ${C.muted} 70%, transparent))`;
      unders[i](clamp(ease.inOutCubic(prog(t, start + 0.4, start + 1.2)) - ease.inCubic(prog(t, end - 0.5, end))));
    });
  };

  return { root, update };
}
