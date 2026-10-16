/**
 * 0 – 7.0 s. Cream paper, the landing's blobs drifting in; the brand lockup
 * (drawn by the header, which carries it up to its place afterwards) and the
 * line "用故事回應故事" with its accent squiggled, then the one sentence that
 * says what Resonance is.
 */
import { drawable, html, place, svg } from '../dom';
import { blob, SQUIGGLE } from '../decor';
import { C, INK_STRONG, measure } from '../kit';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { drift, ease, prog } from '../time';

export const intro: Scene = {
  id: 'intro',
  ...TIMELINE.intro,
  fadeIn: 0,
  build({ copy }) {
    const root = html('div', { class: 'scene', style: { background: C.cream } });

    const blobs = [
      { el: blob(1, 560, C.terracottaLight), x: -150, y: 40, opacity: 0.35, period: 13, phase: 0 },
      { el: blob(3, 460, C.lavender), x: 1560, y: 640, opacity: 0.25, period: 15, phase: 0.6 },
      { el: blob(2, 280, C.sage), x: 1560, y: 360, opacity: 0.18, period: 11, phase: 1.2 },
      { el: blob(4, 220, C.yellow), x: 260, y: 820, opacity: 0.22, period: 12, phase: 0.3 },
    ];
    blobs.forEach((b) => root.append(b.el));

    const [prefix, accent, suffix] = copy.narration.introTagline;
    const squigglePath = svg('path', { d: SQUIGGLE, fill: 'none', stroke: C.terracotta, 'stroke-width': INK_STRONG, 'stroke-linecap': 'round', opacity: 0.6 });
    const squiggle = svg('svg', { viewBox: '0 0 200 12', class: 'abs', style: 'left:0;bottom:-10px;width:100%;height:18px;overflow:visible' }, [squigglePath]);
    const accentEl = html('span', { text: accent, style: { position: 'relative', color: C.terracotta, display: 'inline-block' } }, [squiggle]);
    const line = html('h1', {
      style: { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 84, lineHeight: 1.08, letterSpacing: '-0.03em', color: C.text, whiteSpace: 'nowrap' },
    }, [prefix, accentEl, suffix]);
    const sub = html('p', { text: copy.narration.introSub, style: { fontSize: 28, lineHeight: 1.6, color: C.muted, letterSpacing: '0.02em' } });
    const words = html('div', { class: 'abs', style: { left: 0, top: 540, width: 1920, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, textAlign: 'center' } }, [line, sub]);
    measure(words);
    root.append(words);
    const drawSquiggle = drawable(squigglePath);

    const update = (t: number) => {
      blobs.forEach((b, i) => {
        const inP = ease.outCubic(prog(t, 0.1 + i * 0.12, 1.4 + i * 0.12));
        place(b.el, {
          x: b.x + drift(t, b.period, b.phase) * 22,
          y: b.y + drift(t, b.period * 1.3, b.phase + 0.5) * 16,
          r: drift(t, b.period * 2, b.phase) * 6,
          s: 0.85 + 0.15 * inP,
          opacity: b.opacity * inP,
        });
      });
      const out = ease.inCubic(prog(t, 6.2, 6.85));
      const lp = ease.outCubic(prog(t, 2.1, 2.9));
      place(line, { y: (1 - lp) * 40 - out * 30, opacity: lp * (1 - out) });
      drawSquiggle(ease.inOutCubic(prog(t, 2.8, 3.5)));
      const sp = ease.outCubic(prog(t, 3.1, 3.9));
      place(sub, { y: (1 - sp) * 30 - out * 24, opacity: sp * (1 - out) });
    };
    return { root, update };
  },
};
