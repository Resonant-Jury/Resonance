/**
 * Global 6.4 – 15.0 s (timeline.ts; the times below are local). 故事卡片: a
 * story card is written. Its pen outline draws on and its chalked paper
 * settles in; the cover is drawn as a little doodle of
 * the story; the title is typed (a thin terracotta caret), the tags pop in,
 * the story writes itself on line by line, the wavy rule and the byline
 * follow, and the editor's own line says the draft is saved. The finished
 * card rests at MY_CARD, still from 7.9 s (local), where "visibility" picks
 * it up.
 */
import en from '../../../../src/messages/en.json';
import zhTW from '../../../../src/messages/zh-TW.json';
import { fill } from '../copy';
import { blob } from '../decor';
import { css, html, place } from '../dom';
import { C, makePrng, measure, storyCard } from '../kit';
import { MY_CARD } from '../layout';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { clamp, drift, ease, prog, spring } from '../time';
import { myCardCover } from './write-cover';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

interface Line {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where this line begins along the text written so far (the sum of the widths before it). */
  start: number;
}

/**
 * A block of text that writes itself on without moving a glyph: its lines
 * and the place after each character are measured once (1×, before any
 * zoom), and a mask per line shows the text up to a distance along the lines
 * — a hard edge for typing, a soft one for a quick hand. The caret's place
 * for any distance comes with it.
 */
function writeOn(el: HTMLElement, frame: HTMLElement) {
  const node = el.firstChild as Text;
  const text = node.data;
  const base = el.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  const range = document.createRange();

  // The lines, as the text's own rects grouped by their top.
  range.setStart(node, 0);
  range.setEnd(node, text.length);
  const raw = [...range.getClientRects()].filter((r) => r.width > 0.5);
  const lines: Line[] = [];
  for (const r of raw) {
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

export const write: Scene = {
  id: 'write',
  ...TIMELINE.write,
  build({ copy, locale }) {
    const root = html('div', { class: 'scene', style: { background: C.cream } });
    const s = copy.stories;
    const duration = TIMELINE.write.end - TIMELINE.write.start;

    // ── The intro's two blobs on the right, carried on where it left them ──
    const blobs = [
      { el: blob(2, 280, C.sage), x: 1560, y: 360, opacity: 0.18, period: 11, phase: 1.2 },
      { el: blob(3, 460, C.lavender), x: 1560, y: 640, opacity: 0.25, period: 15, phase: 0.6 },
    ];
    blobs.forEach((b) => root.append(b.el));

    // ── Narration ──────────────────────────────────────────────────────
    const words = copy.narration.write;
    const n = narration({ icon: 'pen', eyebrow: words.eyebrow, title: words.title, body: words.body });
    // The sentence breaks after its first full stop in both cuts.
    css(n.body, { maxWidth: locale === 'zh-TW' ? 456 : 420 });
    const { h: nh } = measure(n.el);
    css(n.el, { top: Math.round(96 + (984 - nh) / 2 - 18) });
    root.append(n.el);

    // ── The card ───────────────────────────────────────────────────────
    const doodle = myCardCover();
    const card = storyCard({
      index: 0,
      width: MY_CARD.width,
      title: s.myCard.title,
      excerpt: s.myCard.excerpt,
      tags: s.myCard.tags,
      minutes: s.myCard.minutes,
      author: s.me,
      cover: doodle.cover,
    });
    // Measured while the card is still at 1× in the measuring layer.
    const titleOn = writeOn(card.title, card.content);
    const storyOn = writeOn(card.excerpt, card.content);

    const caretBar = html('div', { class: 'abs', style: { left: 0, top: 0, width: 1.6, borderRadius: 1, background: C.terracotta, zIndex: 3 } });
    card.content.append(caretBar);

    // The editor's own line: 草稿已自動儲存 · 上午09:41.
    const messages = locale === 'en' ? en : zhTW;
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' }).format(Date.UTC(2026, 9, 16, 1, 41));
    const status = html('p', {
      class: 'abs',
      text: fill(messages.write.autosaved, { time }),
      style: { left: 22, top: card.h + 20, fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, color: C.muted, whiteSpace: 'nowrap' },
    });

    const zoom = html('div', { style: { zoom: MY_CARD.zoom, position: 'relative', width: card.w, height: card.h } }, [card.el, status]);
    const holder = html('div', { class: 'abs', style: { left: MY_CARD.x, top: MY_CARD.y } }, [zoom]);
    root.append(holder);

    // ── Timing (local seconds) ─────────────────────────────────────────
    const T = {
      outline: [0.5, 1.5],
      paper: [0.8, 1.6],
      cover: [1.15, 2.55],
      train: [1.8, 2.85],
      caretIn: 2.05,
      title: [2.3, 3.3],
      tags: 3.3,
      story: [3.7, 5.4],
      sep: [5.4, 5.9],
      byline: 5.7,
      status: 6.2,
      settle: [6.3, 7.9],
    } as const;

    // When each of the title's characters lands: a hand's uneven rhythm, a beat longer after a space.
    const keys = (() => {
      const rnd = makePrng(907);
      const title = [...segmenter.segment(s.myCard.title)].map((g) => g.segment);
      const gaps = title.map((g, i) => (0.7 + 0.6 * rnd()) * (i > 0 && title[i - 1] === ' ' ? 1.5 : 1));
      const sum = gaps.reduce((a, b) => a + b, 0);
      const span = T.title[1] - T.title[0] - 0.08;
      let at = T.title[0] + 0.04;
      return gaps.map((g) => {
        const key = at;
        at += (g / sum) * span;
        return key;
      });
    })();

    /** A spring that has come to rest reads exactly 1, so nothing keeps a transform once it is still. */
    const rest = (t: number, start: number, settle: number, bounce: number) => (t >= start + settle * 1.8 ? 1 : spring(t, start, settle, bounce));

    /** A caret's blink after `from`: on, then off and on again every 1.06 s, with soft edges. */
    const blink = (t: number, from: number) => {
      const x = Math.max(0, t - from);
      return clamp(0.5 + 1.8 * Math.cos((x / 1.06) * Math.PI * 2));
    };

    const update = (t: number) => {
      const g = t + TIMELINE.write.start;
      blobs.forEach((b) =>
        place(b.el, {
          x: b.x + drift(g, b.period, b.phase) * 22,
          y: b.y + drift(g, b.period * 1.3, b.phase + 0.5) * 16,
          r: drift(g, b.period * 2, b.phase) * 6,
          // Gone once the card's outline has closed, so every chapter sits on the same plain paper.
          opacity: b.opacity * (1 - ease.inOutCubic(prog(t, 1.4, 2.4))),
        }),
      );
      n.update(t, 0.2, duration);

      // The card set down: its pen line drawn round, its paper settling in.
      card.pen.drawStroke(ease.inOutCubic(prog(t, T.outline[0], T.outline[1])));
      place(card.paper.el, { opacity: ease.outCubic(prog(t, T.paper[0], T.paper[1])) });

      // The cover, drawn as a doodle of the story, the train rolling in.
      doodle.draw(prog(t, T.cover[0], T.cover[1]));
      doodle.train(prog(t, T.train[0], T.train[1]));

      // The title, typed.
      const typedCount = keys.filter((k) => t >= k).length;
      titleOn.show(t >= T.title[1] ? Infinity : titleOn.stops[typedCount]);

      // The tags, one after another.
      card.tags.forEach((tag, i) => {
        const sp = rest(t, T.tags + i * 0.14, 0.62, 0.26);
        place(tag.el, { s: 0.55 + 0.45 * sp, y: (1 - Math.min(1, sp)) * 6, opacity: clamp(sp * 1.6), origin: '50% 60%' });
      });

      // The story, written on line by line at a quick hand's pace.
      const sp = prog(t, T.story[0], T.story[1]);
      const soft = 20;
      const sd = (storyOn.total + soft) * (0.3 * sp + 0.7 * ease.inOutSine(sp));
      storyOn.show(t >= T.story[1] ? Infinity : sd, soft);

      // The caret: waits in the title, types it, waits, then rides the story's front, blinks, and goes.
      let c: { x: number; y: number; h: number };
      let caretOn: number;
      if (t < T.story[0]) {
        c = titleOn.caret(titleOn.stops[typedCount]);
        const typing = t >= T.title[0] && t < T.title[1];
        caretOn = typing ? 1 : t < T.title[0] ? blink(t, T.caretIn) : blink(t, T.title[1]);
        caretOn *= ease.outCubic(prog(t, T.caretIn, T.caretIn + 0.2));
      } else {
        c = storyOn.caret(clamp(sd - soft * 0.3, 0, storyOn.total));
        caretOn = t < T.story[1] ? 1 : blink(t, T.story[1]);
        caretOn *= 1 - ease.inOutCubic(prog(t, 6.05, 6.35));
      }
      const pad = c.h * 0.08;
      css(caretBar, { left: c.x + 0.6, top: c.y + pad, height: c.h - pad * 2 });
      place(caretBar, { opacity: caretOn });

      // The wavy rule, then the byline.
      card.sep.draw(ease.inOutCubic(prog(t, T.sep[0], T.sep[1])));
      const av = rest(t, T.byline, 0.6, 0.22);
      place(card.avatar.el, { s: 0.5 + 0.5 * av, opacity: clamp(av * 1.6), origin: '50% 50%' });
      const nameP = ease.outCubic(prog(t, T.byline + 0.1, T.byline + 0.6));
      place(card.name, { x: (1 - nameP) * -10, opacity: nameP });
      const readP = ease.outCubic(prog(t, T.byline + 0.18, T.byline + 0.68));
      place(card.read, { x: (1 - readP) * -10, opacity: readP });
      const arrowP = ease.outCubic(prog(t, T.byline + 0.3, T.byline + 0.8));
      place(card.arrow, { x: (1 - arrowP) * -8, opacity: 0.28 * arrowP });

      // The draft's save line, under the card, leaving with the narration.
      const st = Math.min(ease.outCubic(prog(t, T.status, T.status + 0.5)), 1 - ease.inCubic(prog(t, duration - 0.6, duration - 0.1)));
      place(status, { y: (1 - ease.outCubic(prog(t, T.status, T.status + 0.5))) * 6, opacity: st });

      // At rest: one slow breath, then still at MY_CARD from 7.9 for the hand-over.
      const fp = ease.inOutSine(prog(t, T.settle[0], T.settle[1]));
      const lift = t > T.settle[0] && t < T.settle[1] ? -2.5 * Math.sin(Math.PI * fp) : 0;
      place(holder, lift === 0 ? {} : { y: lift });
    };

    return { root, update };
  },
};
