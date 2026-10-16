/**
 * A chapter's words, at video size, on the left of the stage: an eyebrow
 * pill (the feature's icon and name), the line, and a sentence or two under
 * it. Every feature scene uses this block, so they read as one tour.
 */
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { css, html, place } from './dom';
import { C, face, icon, measure, wobRect, type IconName } from './kit';
import { ease, prog, spring } from './time';

export const NARRATION_X = 132;
export const NARRATION_W = 600;

export interface NarrationOpts {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  /** Top of the block (its height decides nothing else). */
  y?: number;
  width?: number;
}

export function narration(o: NarrationOpts) {
  const ic = icon(o.icon, 22, C.onTonal);
  const label = html('span', { text: o.eyebrow });
  const pill = html('div', { class: 'eyebrow' }, [ic.el, label]);
  const { w: pw, h: ph } = measure(pill);
  const pillFace = face(
    wobRect(pw, ph, ph / 2, 211, autoMag(pw, ph), { segmentsH: autoSegments(pw), segmentsV: 2, curve: autoCurve(pw, ph), cornerJitter: 1, cornerOffset: 0 }),
    pw,
    ph,
    { fill: C.buttonTonal, grain: { opacity: 0.3, frequency: 1.1, seed: 211 } },
  );
  pill.prepend(pillFace.el);
  css(pill, { width: pw, height: ph });

  const title = html('h2', { class: 'narration-title', text: o.title });
  const body = html('p', { class: 'narration-body', text: o.body });
  const pillRow = html('div', {}, [pill]);
  const el = html('div', { class: 'abs', style: { left: NARRATION_X, top: o.y ?? 0, width: o.width ?? NARRATION_W, display: 'flex', flexDirection: 'column', gap: 26 } }, [pillRow, title, body]);
  const { h } = measure(el);

  /**
   * Brings the words in from `start` (local seconds) and takes them away
   * over the last 0.5 s before `end`: the pill pops, the line rises, the
   * sentence follows.
   */
  const update = (t: number, start: number, end: number) => {
    const out = ease.inCubic(prog(t, end - 0.55, end));
    const pop = spring(t, start, 0.7, 0.2);
    place(pill, { s: 0.6 + 0.4 * pop, opacity: Math.min(1, pop * 1.4) * (1 - out), origin: '0% 50%' });
    ic.paths.forEach((p, i) => {
      p.setAttribute('pathLength', '1');
      p.style.strokeDasharray = '1 1';
      p.style.strokeDashoffset = String(1 - ease.outCubic(prog(t, start + 0.15 + i * 0.08, start + 0.75 + i * 0.08)));
    });
    const tp = ease.outCubic(prog(t, start + 0.18, start + 0.95));
    place(title, { y: (1 - tp) * 34 - out * 24, opacity: tp * (1 - out) });
    const bp = ease.outCubic(prog(t, start + 0.42, start + 1.2));
    place(body, { y: (1 - bp) * 28 - out * 18, opacity: bp * (1 - out) });
  };

  return { el, h, update, pill, title, body };
}
