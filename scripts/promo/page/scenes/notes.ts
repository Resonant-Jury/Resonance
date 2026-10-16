/**
 * 35.4 – 48.2 s. 小紙條: a note only the author reads — a letter, until they write back.
 *
 * 晴天's card (凌晨四點的便利商店, someone 阿樹 isn't connected to) comes in
 * as a new page from the right, the action bar under it, its byline's face
 * popping; a finger taps 寄小紙條 and the page recedes (fades, sinks, softens)
 * under the note composer, centred on it — its label, its wobbly field, the
 * note typed in, the counter following — then 寄出, and the same sheet says
 * the note is on its way. The sheet folds into an envelope that arcs into the
 * thread as it slides in; the card it was left on builds in the thread as the
 * envelope travels (quote, head, cover, title), and the envelope comes down on
 * the note's own place and opens out into its bubble. Right under it, a short
 * pen rule where the composer will be and, alone, the letter's rule:
 * 「對方會收到你的紙條，回覆後就能繼續聊」. Their reply arrives in its place,
 * the foot easing down to the pane's bottom; 已連結 and the composer.
 *
 * Local moments, zh-TW (en, whose ~100-character note types in 3.1 s, in
 * brackets): card in 0.05–1.0, tap 1.2 (1.06), sheet 1.5 (1.36), typing
 * 1.9–4.4 (1.66–4.76), 寄出 4.7 (5.06), sent 4.84 (5.2), fold 5.52 (5.8) as the
 * thread slides in, envelope flies 5.96–6.5 (6.24–6.78) while the quote
 * builds, the note opens out 6.47 (6.75), the letter's line alone 6.57–8.91
 * (6.85–9.19), reply 9.17 (9.45), 已連結 9.57 (9.85) and the composer whole by
 * 10.07 (10.35), held to the cross-fade at 12.2.
 */
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { AVATAR_COLORS } from '@/lib/design/avatarColors';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { fill } from '../copy';
import { css, drawable, html, place, svg } from '../dom';
import {
  autoRect,
  avatar,
  bubblePath,
  button,
  C,
  chalk,
  face,
  family,
  icon,
  INK,
  INK_LIGHT,
  makePrng,
  measure,
  QUOTE_RADIUS,
  scrim,
  seedFromId,
  segmentedBar,
  shapeGrain,
  shapeSvg,
  storyCard,
  tapMark,
  wavyRule,
  wobCircle,
  wobRect,
} from '../kit';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { THEIR_CARD } from '../layout';
import { TIMELINE } from '../timeline';
import { clamp, drift, ease, lerp, prog, spring } from '../time';
import { notesCardCover } from './notes-cover';

const DURATION = TIMELINE.notes.end - TIMELINE.notes.start;

/** The middle of the demonstration area (x 800–1800, y 110–1040). */
const DEMO_CX = 1300;
const DEMO_CY = 575;

/** The note composer (NoteComposer in a Modal: maxWidth 520, padding 32/28) at video size. */
const SHEET_W = 520;
const SHEET_Z = 1.35;
const FIELD_W = SHEET_W - 56;
/** Four rows of 15/1.6 plus the field's 14px padding above and below. */
const FIELD_H = 4 * 24 + 28;

/** The envelope the sent sheet folds into, on the stage. */
const ENV_W = 124;
const ENV_H = 82;
/** Its size at the landing (of ENV_W). */
const ENV_LAND = 0.72;

/** How the page recedes under the composer (as visibility's card does): it sinks this far (stage px), shrinks and fades by these. */
const SINK_Y = 20;
const SINK_S = 0.04;
const SINK_FADE = 0.5;

/** The thread: a column 520 wide (the bubbles' --bubble-max). */
const PANE_W = 520;
const PANE_PAD = 16;
const HEADER_H = 58 + 14;

// ── Moments (local seconds) ─────────────────────────────────────────

function moments(isEn: boolean) {
  const tap1 = isEn ? 1.06 : 1.2;
  const sheetIn = tap1 + 0.3;
  const typeA = sheetIn + (isEn ? 0.3 : 0.4);
  // The en note is ~100 characters in 3.1 s; zh's 35 take 2.5.
  const typeB = typeA + (isEn ? 3.1 : 2.5);
  const tap2 = typeB + 0.3;
  const swap = tap2 + 0.14;
  const foldA = swap + (isEn ? 0.6 : 0.68);
  const flyA = foldA + 0.44;
  const flyB = flyA + 0.54;
  /** The envelope is on the note's place and opens out into its bubble. */
  const land = flyB - 0.03;
  const awaitIn = land + 0.1;
  // The letter's line stands alone ~2.2 s (from its entrance to its leaving) before the reply.
  const reply = awaitIn + 2.6;
  return {
    tap1,
    dimIn: tap1 + 0.1,
    sheetIn,
    focus: sheetIn + 0.22,
    typeA,
    typeB,
    tap2,
    swap,
    foldA,
    paneIn: foldA + 0.15,
    flyA,
    flyB,
    land,
    awaitIn,
    reply,
    // 已連結, then the composer whole 0.5 s later: ≥ 1.8 s before the cross-fade at 12.2 in both cuts.
    connect: reply + 0.4,
  };
}

/** The pace of a hand typing: a little uneven, resting after punctuation. Returns how many graphemes show at `t`. */
function typingSchedule(text: string, a: number, b: number, seed: number) {
  const g = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  const rnd = makePrng(seed);
  const at: number[] = [];
  let acc = 0;
  g.forEach((ch, i) => {
    acc += 0.7 + rnd() * 0.6;
    at.push(acc);
    if (/[。，、！？.,!?—]/.test(ch) && i < g.length - 1) acc += 2.6;
    else if (ch === ' ') acc += 0.2;
  });
  const total = acc;
  return {
    graphemes: g,
    count: (t: number) => {
      if (t <= a) return 0;
      const w = ((t - a) / (b - a)) * total;
      let n = 0;
      while (n < at.length && at[n] <= w) n++;
      return n;
    },
  };
}

/**
 * A chat bubble sized to its words: kit.bubble's look, but the lines break
 * where a reader would (zh between clauses; en balanced, a quoted phrase kept whole) and
 * the bubble is as wide as its longest line, so no word or character is left
 * alone and no empty room trails the words.
 */
function fitBubble(text: string, o: { own: boolean; maxWidth: number; seedKey: string; cjk: boolean }) {
  const words = html('div', {
    class: 'bubble-words',
    // en: a quoted phrase stays whole, and a one-letter word (I, a) stays with the word after it.
    text: o.cjk ? text : text.replace(/“[^”]*”/g, (q) => q.replace(/ /g, '\u00a0')).replace(/\b(\w) /g, '$1\u00a0'),
    style: o.cjk ? { wordBreak: 'keep-all', overflowWrap: 'anywhere' } : { textWrap: 'balance' },
  });
  const el = html('div', { class: 'bubble', style: { maxWidth: o.maxWidth } }, [words]);
  const lines = () => {
    const range = document.createRange();
    range.selectNodeContents(words);
    return [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.width);
  };
  const natural = measure(el);
  const before = lines();
  // Snug to the longest line, unless that would move a break.
  css(el, { width: Math.ceil(Math.max(...before) + 28 + 1), maxWidth: 'none' });
  const after = lines();
  if (after.length !== before.length || after.some((w, i) => Math.abs(w - before[i]) > 0.5)) css(el, { width: Math.ceil(natural.w) });
  const w = Math.ceil(measure(el).w);
  const { h } = measure(el);
  css(el, { width: w, height: h });
  const d = bubblePath(w, h, seedFromId(o.seedKey, 7), { own: o.own });
  el.prepend(face(d, w, h, { fill: o.own ? C.bubbleMine : C.bubbleTheirs }).el);
  return { el, w, h };
}

/** A small tonal pill with an icon: the relationship's state, in the profile's words. */
function statePill(label: string) {
  const ic = icon('user-check', 17, C.onTonal);
  const text = html('span', { text: label });
  const el = html('span', {
    class: 'pill',
    style: { gap: 7, padding: '7px 16px 7px 12px', fontSize: 14, letterSpacing: '0.03em', color: C.onTonal, textTransform: 'none' },
  }, [ic.el, text]);
  css(text, { position: 'relative', zIndex: 1 });
  css(ic.el, { position: 'relative', zIndex: 1 });
  const { w, h } = measure(el);
  const d = wobRect(w, h, h / 2, 233, autoMag(w, h), { segmentsH: autoSegments(w), segmentsV: 2, curve: autoCurve(w, h), cornerJitter: 1, cornerOffset: 0 });
  const f = face(d, w, h, { fill: C.buttonTonal, grain: { opacity: 0.38, frequency: 1.1, seed: 233 } });
  el.prepend(f.el);
  css(el, { width: w, height: h });
  return { el, w, h, icon: ic };
}

export const notes: Scene = {
  id: 'notes',
  ...TIMELINE.notes,
  build({ copy, locale }) {
    const ui = copy.ui;
    const s = copy.stories;
    const isEn = locale === 'en';
    const msgs = isEn ? en : (zhTW as unknown as typeof en);
    const T = moments(isEn);
    // Its own stacking context: the layers' z-indexes stay inside the scene, so the next scene's cross-fade covers all of it.
    const root = html('div', { class: 'scene', style: { background: C.cream, isolation: 'isolate' } });

    // ── Narration ───────────────────────────────────────────────────
    const words = copy.narration.notes;
    const nar = narration({ icon: 'note', eyebrow: words.eyebrow, title: words.title, body: words.body });
    css(nar.el, { top: Math.round(96 + (984 - nar.h) / 2 - 24), zIndex: 6 });

    // ── 晴天's card on its page, the card page's action bar under it ──
    const Z = THEIR_CARD.zoom;
    const fam = family(4);
    const picture = notesCardCover();
    const card = storyCard({
      index: 4,
      title: s.writerCard.title,
      excerpt: s.writerCard.excerpt,
      tags: s.writerCard.tags,
      author: s.writer,
      minutes: s.writerCard.minutes,
      cover: picture.cover,
    });
    css(card.title, { textWrap: 'balance' });
    const bar = segmentedBar([
      { labels: [ui.resonate, ui.resonated], icons: ['wave', 'check'] },
      { labels: [ui.noteEntry], icons: ['note'] },
      // In en the row runs out of room, and the bookmark keeps only its icon, as the app's does.
      { labels: [ui.bookmark], icons: ['bookmark'], iconOnly: locale === 'en' },
    ]);
    const barLeft = (card.w - bar.w) / 2;
    const barTop = card.h + THEIR_CARD.barGap;
    css(bar.el, { position: 'absolute', left: barLeft, top: barTop });
    // The note segment's hover wash (terracotta 14%), inside the bar's clip, under its seams.
    const segW = parseFloat(bar.segments[1].el.style.width);
    const segX = bar.centre(1).x - segW / 2;
    const wash = svg('rect', { x: segX, y: -20, width: segW, height: bar.h + 40, fill: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)', opacity: 0 });
    const clipped = bar.el.querySelector('g[clip-path]');
    clipped?.insertBefore(wash, clipped.children[1 + 3] ?? null);
    const cardInner = html('div', { style: { position: 'relative', width: card.w, height: barTop + bar.h, zoom: Z } }, [card.el, bar.el]);
    const cardGroup = html('div', { class: 'abs', style: { left: THEIR_CARD.x, top: THEIR_CARD.y, zIndex: 1 } }, [cardInner]);
    /** The card and its bar on the stage: their middle, where the composer opens. */
    const groupH = (barTop + bar.h) * Z;
    const groupCY = THEIR_CARD.y + groupH / 2;
    /** Where a fingertip presses 寄小紙條: a little under the label's middle. */
    const noteSegment = {
      x: THEIR_CARD.x + (barLeft + bar.centre(1).x) * Z,
      y: THEIR_CARD.y + (barTop + bar.centre(1).y) * Z + 9,
    };

    // ── The note composer ───────────────────────────────────────────
    const label = html('div', {
      text: ui.noteLabel,
      style: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, marginBottom: 10, lineHeight: 1.3 },
    });
    const typedEl = html('span');
    const caret = html('span', {
      style: { display: 'inline-block', width: 1.6, height: '1.2em', marginLeft: 1, marginRight: -2.6, verticalAlign: '-0.22em', background: C.text, borderRadius: 1 },
    });
    const placeholderEl = html('span', { text: ui.notePlaceholder, style: { fontStyle: 'italic', color: 'var(--placeholder)' } });
    const fieldText = html('div', {
      style: { position: 'relative', zIndex: 1, height: FIELD_H, padding: '14px 18px', fontSize: 15, lineHeight: 1.6, color: C.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
    }, [typedEl, caret, placeholderEl]);
    const fieldOutline = svg('path', { d: autoRect(FIELD_W, FIELD_H, 16, 17), fill: 'none', 'stroke-width': INK, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const field = html('div', { style: { position: 'relative', width: FIELD_W, height: FIELD_H, background: C.cream, borderRadius: 16 } }, [
      shapeSvg(FIELD_W, FIELD_H, [fieldOutline]),
      fieldText,
    ]);
    const hint = html('div', { text: ui.noteHint, style: { flex: 1, marginTop: 6, fontSize: 12, lineHeight: 1.5, color: C.muted } });
    const counter = html('div', { text: '0 / 2000', style: { marginTop: 6, fontSize: 11, lineHeight: 1.6, color: C.muted, fontVariantNumeric: 'tabular-nums', textAlign: 'right' } });
    const foot = html('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 } }, [hint, counter]);
    const cancelBtn = button(ui.noteCancel, 'tonal');
    const sendBtn = button(ui.noteSend, 'solid');
    const actions = html('div', { style: { marginTop: 18, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 } }, [cancelBtn.el, sendBtn.el]);
    const composer = html('div', { class: 'abs', style: { left: 0, top: 0, width: SHEET_W, padding: '32px 28px', zIndex: 2 } }, [label, field, foot, actions]);

    const sentIcon = icon('note', 18, C.text);
    const sentRow = html('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, [
      sentIcon.el,
      html('span', { text: ui.noteSent, style: { fontSize: 14, lineHeight: 1.4, color: C.text } }),
    ]);
    const closeBtn = button(msgs.card.note.close, 'tonal');
    const closeRow = html('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 18 } }, [closeBtn.el]);
    const sent = html('div', { class: 'abs', style: { left: 0, top: 0, width: SHEET_W, padding: '32px 28px', zIndex: 2 } }, [sentRow, closeRow]);

    const H1 = Math.ceil(measure(composer).h);
    const H2 = Math.ceil(measure(sent).h);
    // Where the send button sits inside the sheet (1×), for the finger.
    const composerBox = composer.getBoundingClientRect();
    const sendBox = sendBtn.el.getBoundingClientRect();
    const sendAt = { x: sendBox.left - composerBox.left + sendBox.width / 2, y: sendBox.top - composerBox.top + sendBox.height / 2 };

    // The sheet is centred on the page it opens over — the card and its bar,
    // as they stand once sunk back — so the cover shows above it and the
    // byline and bar below, about as much of each.
    const sheetCX = THEIR_CARD.x + (card.w * Z) / 2;
    const sheetCY = Math.round(groupCY + SINK_Y);
    const sheetTop = Math.round(sheetCY - (H1 * SHEET_Z) / 2);
    const sheetLeft = sheetCX - (SHEET_W * SHEET_Z) / 2;

    // The sheet (Modal: wobRect R 26, seed 17; card-bg chalked with seed 18, grain 0.3, pen oklch(40% 0.06 60)).
    // Folding, the same wobble draws in to an envelope's size: its paper warms
    // to the note's colour, its pen to terracotta, and as it shrinks the
    // envelope's flap and folds are drawn across it, then its seal.
    const sheetFill = svg('path', { filter: chalk(18) });
    const sheetGrain = svg('path', { fill: 'black', filter: shapeGrain(0.3, 0.88, 17) });
    const pen = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
    const sheetPen = svg('path', { 'stroke-width': INK, ...pen });
    const EWu = ENV_W / SHEET_Z;
    const EHu = ENV_H / SHEET_Z;
    const flap = svg('path', { 'stroke-width': INK, ...pen });
    const foldL = svg('path', { 'stroke-width': INK_LIGHT, opacity: 0.65, ...pen });
    const foldR = svg('path', { 'stroke-width': INK_LIGHT, opacity: 0.65, ...pen });
    const drawFlap = drawable(flap);
    const drawFolds = [drawable(foldL), drawable(foldR)];
    const seal = svg('path', { d: wobCircle(0, 0, 5.4, 613, { segments: 7, mag: 0.5, cpJitter: 0.5 }), fill: C.terracotta });
    const sealG = svg('g', {}, [seal]);
    // The envelope's lines and seal, which fade as it opens out into the bubble.
    const envLines = svg('g', {}, [foldL, foldR, flap, sealG]);
    const shapeG = svg('g', {}, [sheetFill, sheetGrain, sheetPen, envLines]);
    const sheetSvg = shapeSvg(SHEET_W, H1, [shapeG]);
    const sheet = html('div', { style: { position: 'relative', width: SHEET_W, height: H1, zoom: SHEET_Z } }, [sheetSvg, composer, sent]);
    // Over the thread as it flies in, so it sits above the pane (z 4).
    const sheetOuter = html('div', { class: 'abs', style: { left: sheetLeft, top: sheetTop, zIndex: 5 } }, [sheet]);
    let lastShape = '';
    let sealAt = '0,0';
    /** The sheet's wobble at w × h (1×) with corners of radius `R`, centred in a box `boxH` tall. */
    const setShape = (w: number, h: number, boxH: number, R: number) => {
      const key = `${w.toFixed(1)}|${h.toFixed(1)}|${boxH.toFixed(1)}|${R.toFixed(1)}`;
      if (key === lastShape) return;
      lastShape = key;
      const d = wobRect(w, h, R, 17, Math.min(w, h) * 0.025, {
        segmentsH: [3, 4],
        segmentsV: [5, 6],
        curve: 0.6,
        cornerJitter: 0.9,
        cornerOffset: Math.min(5, Math.min(w, h) * 0.04),
      });
      sheetFill.setAttribute('d', d);
      sheetGrain.setAttribute('d', d);
      sheetPen.setAttribute('d', d);
      // The envelope's lines across whatever size the paper is now: the flap's V from the top corners, the folds up from the bottom ones.
      const k = Math.min(1, Math.min(w, h) / 60);
      flap.setAttribute('d', `M ${5.5 * k},${6 * k} C ${w * 0.24},${h * 0.26} ${w * 0.38},${h * 0.5} ${w * 0.5},${h * 0.55} C ${w * 0.62},${h * 0.5} ${w * 0.76},${h * 0.26} ${w - 5.5 * k},${6.4 * k}`);
      foldL.setAttribute('d', `M ${5 * k},${h - 5 * k} C ${w * 0.2},${h * 0.78} ${w * 0.3},${h * 0.66} ${w * 0.4},${h * 0.6}`);
      foldR.setAttribute('d', `M ${w - 5 * k},${h - 5.4 * k} C ${w * 0.8},${h * 0.78} ${w * 0.7},${h * 0.66} ${w * 0.6},${h * 0.6}`);
      sealAt = `${(w / 2).toFixed(2)},${(h * 0.56).toFixed(2)}`;
      shapeG.setAttribute('transform', `translate(${((SHEET_W - w) / 2).toFixed(2)},${((boxH - h) / 2).toFixed(2)})`);
      sheet.style.height = `${boxH}px`;
    };

    // ── The dim: the film's one dialog scrim, centred on the sheet; its flat
    // middle (70% of the radii) reaches ~80 px past the sheet's sides and
    // takes in its corners, so the fade happens away from its edges ──
    const dimmer = scrim(sheetCX, sheetCY, Math.round(((SHEET_W * SHEET_Z) / 2 + 96) / 0.7), Math.round(((H1 * SHEET_Z) / 2 + 120) / 0.7));
    css(dimmer.el, { zIndex: 2 });

    // ── The thread ─────────────────────────────────────────────────
    const theirColour = AVATAR_COLORS[4];
    const inner = PANE_W - PANE_PAD * 2;
    const ownMax = Math.min(inner * 0.72, 520);
    const theirMax = Math.min((inner - 36) * 0.72, 520);

    // Header: back, their face and pen name, the wavy pen line under the row.
    const back = icon('arrow-right', 16, C.muted);
    css(back.el, { transform: 'scaleX(-1)', marginRight: 2 });
    const headFace = avatar(38, s.writer.initials, theirColour);
    const headName = html('span', { text: s.writer.name, style: { fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: C.text } });
    const headRow = html('div', {
      class: 'abs',
      style: { left: 0, top: 0, width: PANE_W, height: 58, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 10px 20px', zIndex: 2 },
    }, [back.el, headFace.el, headName]);
    const ruleW = PANE_W - 28;
    const headRule = svg('svg', { width: ruleW, height: 20, viewBox: `0 52 ${ruleW} 20`, class: 'abs', style: `left:14px;top:52px;overflow:visible;z-index:2` }, [
      svg('path', { d: pointsToBezier(wavyPoints(ruleW, 58 + 14 * 0.35, 1.4, 41, 12)), fill: 'none', stroke: 'var(--field-border-hover)', 'stroke-width': INK, 'stroke-linecap': 'round', opacity: 0.55 }),
    ]);

    // The note: the card it was left on (NoteQuote → SharedCardContent), its bubble over the quote's foot.
    const QUOTE_W = 300;
    const qAvatar = avatar(32, s.writer.initials, theirColour);
    const readTime = fill(ui.readMinutes, { count: s.writerCard.minutes });
    const qHead = html('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: 12 } }, [
      qAvatar.el,
      html('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', gap: 3, minWidth: 0 } }, [
        html('span', { text: s.writer.name, style: { fontSize: 14, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
        // The read time alone, in both cuts: the source word (共振 / Resonance) is the very word the film
        // just taught for an answering card, and would make this note's card read as one.
        html('span', { text: readTime, style: { fontSize: 12, lineHeight: 1.35, color: C.muted, whiteSpace: 'nowrap' } }),
      ]),
    ]);
    // The cover edge to edge at 1.91:1, 4px past each side (SharedCard .cover).
    const coverW = QUOTE_W + 8;
    const coverH = coverW / 1.91;
    const qCover = html('div', { style: { position: 'relative', width: coverW, height: coverH, margin: '0 -4px', overflow: 'hidden' } }, [
      svg('svg', { width: coverW, height: coverH, viewBox: `0 0 ${coverW} ${coverH}`, style: 'display:block' }, picture.cover(coverW, coverH, fam)),
    ]);
    const clampLines = (el: HTMLElement, n: number) => {
      el.style.display = '-webkit-box';
      el.style.setProperty('-webkit-line-clamp', String(n));
      el.style.setProperty('-webkit-box-orient', 'vertical');
      el.style.overflow = 'hidden';
      return el;
    };
    const qText = html('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px 0' } }, [
      clampLines(html('span', { text: s.writerCard.title, style: { fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, lineHeight: 1.3 } }), 3),
      clampLines(html('span', { text: s.writerCard.excerpt, style: { fontSize: 13, lineHeight: 1.45, color: C.muted } }), 2),
    ]);
    const quote = html('div', { style: { position: 'relative', width: QUOTE_W, color: C.text, isolation: 'isolate' } }, [
      html('div', { class: 'abs', style: { inset: -4, zIndex: -1, background: C.bubbleQuote } }),
      qHead,
      qCover,
      qText,
      html('div', { style: { height: 12 + 14 } }),
    ]);
    const quoteH = measure(quote).h;
    quote.style.clipPath = `path('${bubblePath(QUOTE_W, quoteH, seedFromId('note-1', 19), { own: true, maxRadius: QUOTE_RADIUS })}')`;
    // zh: 322 ends the first line at 大夜班， so 「那句」 stays with 「辛苦了」.
    const noteBubble = fitBubble(s.note, { own: true, maxWidth: isEn ? ownMax : 322, seedKey: 'note-1', cjk: !isEn });
    css(noteBubble.el, { marginTop: -14, zIndex: 1 });
    const noteMsg = html('div', { class: 'abs', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } }, [quote, noteBubble.el]);
    const noteBox = measure(noteMsg);

    // Their answer, their face beside it.
    const replyBubble = fitBubble(s.reply, { own: false, maxWidth: theirMax, seedKey: 'm2', cjk: !isEn });
    const replyFace = avatar(28, s.writer.initials, theirColour);
    const replyRow = html('div', { class: 'abs', style: { display: 'flex', alignItems: 'flex-end' } }, [
      html('div', { style: { width: 28, height: 28, marginRight: 8, flexShrink: 0 } }, [replyFace.el]),
      replyBubble.el,
    ]);
    const replyBox = measure(replyRow);

    // The foot: the letter's line where the composer will be; then 已連結 above the composer.
    const INPUT_H = 24 + 28;
    const SEND_W = 48;
    const SEND_H = 40;
    const inputW = PANE_W - PANE_PAD * 2 - 36 - SEND_W - 16;
    const cardsBtn = html('div', { style: { width: 36, height: 36, display: 'grid', placeItems: 'center', flexShrink: 0, marginBottom: 8 } }, [icon('cards', 19, C.muted).el]);
    const input = html('div', { style: { position: 'relative', width: inputW, height: INPUT_H, background: C.cream, borderRadius: 16, flexShrink: 0 } }, [
      shapeSvg(inputW, INPUT_H, [svg('path', { d: autoRect(inputW, INPUT_H, 16, 17), fill: 'none', stroke: 'var(--field-border)', 'stroke-width': INK, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })]),
      html('div', {
        text: msgs.messages.placeholder,
        style: { position: 'relative', zIndex: 1, padding: '14px 18px', fontSize: 15, lineHeight: 1.6, fontStyle: 'italic', color: 'var(--placeholder)', whiteSpace: 'nowrap' },
      }),
    ]);
    const sendD = wobRect(SEND_W, SEND_H, 12, 23, 1.0, { segmentsH: 1, segmentsV: 1, curve: 1.3, cornerJitter: 2.4, cornerOffset: 2 });
    const sendGlyph = icon('send', 20, C.cream, INK);
    css(sendGlyph.el, { position: 'relative', zIndex: 1 });
    const threadSend = html('div', { style: { position: 'relative', width: SEND_W, height: SEND_H, marginBottom: 6, flexShrink: 0, display: 'grid', placeItems: 'center', opacity: 0.45 } }, [
      face(sendD, SEND_W, SEND_H, { fill: C.terracotta, grain: { opacity: 0.38, frequency: 1.1, seed: 23 } }).el,
      sendGlyph.el,
    ]);
    const composerRow = html('div', {
      class: 'abs',
      style: { left: PANE_PAD, top: 0, width: PANE_W - PANE_PAD * 2, display: 'flex', alignItems: 'flex-end', gap: 8, paddingTop: 12 },
    }, [cardsBtn, input, threadSend]);
    const composerH = measure(composerRow).h;
    const pill = statePill(ui.connected);
    const PILL_GAP = 6;
    // The letter's rule, with the weight of the composer it stands in for: body
    // size, near-full ink; en's two sentences a line each.
    const awaiting = html('div', {
      class: 'abs',
      text: isEn ? ui.awaitingReply.replace(/\. /g, '.\n') : ui.awaitingReply,
      style: {
        left: 0,
        top: 0,
        width: PANE_W,
        padding: '0 32px',
        textAlign: 'center',
        fontSize: 15,
        lineHeight: 1.55,
        color: `color-mix(in oklch, ${C.text} 80%, transparent)`,
        whiteSpace: 'pre-line',
        textWrap: 'balance',
      },
    });
    const slotH = pill.h + PILL_GAP + composerH;
    const composerTop = pill.h + PILL_GAP;
    css(composerRow, { top: composerTop });
    css(pill.el, { position: 'absolute', left: (PANE_W - pill.w) / 2, top: 0 });
    // A short pen rule where the composer's top will be, the line under it.
    const LETTER_RULE_W = 132;
    const letterRuleY = composerTop + 12;
    const letterRule = wavyRule(LETTER_RULE_W, 52, 'var(--field-border-hover)', { amp: 1.5, steps: 6, width: INK_LIGHT });
    css(letterRule.el, { position: 'absolute', left: (PANE_W - LETTER_RULE_W) / 2, top: letterRuleY - 4 });
    css(awaiting, { top: letterRuleY + 14 });

    // The column, reading from the top as the app's does: the history's start
    // (its 64px row), the note, their answer; the foot holds the letter's line,
    // then 已連結 and the composer.
    const OLDER_TOP = HEADER_H - 2;
    const NOTE_TOP = OLDER_TOP + 64 + 6;
    const RUN_GAP = 12;
    const replyY = NOTE_TOP + noteBox.h + RUN_GAP;
    const slotTop = replyY + replyBox.h + 14;
    const PANE_H = Math.ceil(slotTop + slotH + 18);
    const beginning = html('div', {
      class: 'abs',
      text: msgs.messages.beginning,
      style: { left: 0, top: OLDER_TOP, width: PANE_W, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1.4, color: C.muted },
    });
    const noteX = PANE_W - PANE_PAD - noteBox.w;
    css(noteMsg, { left: noteX, top: NOTE_TOP, width: noteBox.w });
    css(replyRow, { left: PANE_PAD, top: replyY });
    const slot = html('div', { class: 'abs', style: { left: 0, top: slotTop, width: PANE_W, height: slotH } }, [letterRule.el, awaiting, pill.el, composerRow]);
    // While the note waits as a letter, the foot rides up under it (its rule
    // LETTER_GAP under the bubble), where the reply will come; it eases back
    // down to the pane's bottom as the reply arrives.
    const LETTER_GAP = 30;
    const letterLift = NOTE_TOP + noteBox.h + LETTER_GAP - (slotTop + letterRuleY);

    const paneD = wobRect(PANE_W, PANE_H, 26, 37, Math.min(PANE_W, PANE_H) * 0.02, { segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.6, cornerJitter: 0.9, cornerOffset: 5 });
    const paneFace = face(paneD, PANE_W, PANE_H, { fill: C.cardBg, chalkSeed: 38, grain: { opacity: 0.22, frequency: 0.88, seed: 37 }, stroke: 'oklch(40% 0.06 60 / 0.6)', strokeWidth: INK });
    const pane = html('div', { style: { position: 'relative', width: PANE_W, height: PANE_H, fontFamily: 'var(--font-body)', color: C.text } }, [
      paneFace.el,
      headRow,
      headRule,
      beginning,
      noteMsg,
      replyRow,
      slot,
    ]);
    const PANE_Z = Math.min(1.3, 900 / PANE_H);
    css(pane, { zoom: PANE_Z });
    const paneLeft = DEMO_CX - (PANE_W * PANE_Z) / 2;
    const paneTop = Math.max(118, DEMO_CY - (PANE_H * PANE_Z) / 2);
    const paneOuter = html('div', { class: 'abs', style: { left: paneLeft, top: paneTop, zIndex: 4 } }, [pane]);

    // Where the envelope comes down: the note's own bubble (its middle, in the note's box and on the stage).
    const noteOrigin = { x: noteBox.w - noteBubble.w / 2, y: quoteH - 14 + noteBubble.h / 2 };
    /** The bubble's size in the flying sheet's own units (it lands at ENV_LAND of the sheet's zoom), for the envelope to open out to. */
    const bubbleU = { w: (noteBubble.w * PANE_Z) / (SHEET_Z * ENV_LAND), h: (noteBubble.h * PANE_Z) / (SHEET_Z * ENV_LAND) };

    const tap = tapMark();
    css(tap.el, { zIndex: 8 });

    root.append(nar.el, cardGroup, dimmer.el, paneOuter, sheetOuter, tap.el);

    const typing = typingSchedule(s.note, T.typeA, T.typeB, 23);

    /** The card's breathing, once it has come in (stage px). */
    const cardY = (t: number) => drift(t - 0.85, 7) * 2 * ease.inOutCubic(prog(t, 0.85, 2));
    /** The sheet's settle and breathing (stage px), before it folds. */
    const sheetY = (t: number) => (1 - spring(t, T.sheetIn, 0.55, 0.14)) * 12 + drift(t, 6, 0.6) * 1.5;
    /** The thread's slide in from the right, and its breathing and leaving (stage px). */
    const paneX = (t: number) => (1 - ease.outCubic(prog(t, T.paneIn, T.paneIn + 0.8))) * 150;
    const paneY = (t: number, out: number) => drift(t, 8, 0.4) * 2.5 - out * 12;

    const update = (t: number) => {
      nar.update(t, 0.35, DURATION);
      picture.sway(t);
      const out = ease.inOutCubic(prog(t, DURATION - 0.62, DURATION - 0.04));

      // ── The card: a new page in from the right; it recedes under the composer (fades, sinks, softens); away to the left as the thread comes ──
      const enter = ease.outCubic(prog(t, 0.05, 1.0));
      const dimIn = ease.inOutCubic(prog(t, T.dimIn, T.dimIn + 0.45));
      const away = ease.inOutCubic(prog(t, T.foldA - 0.1, T.foldA + 0.25));
      const dim = dimIn * (1 - away);
      const sink = ease.outCubic(prog(t, T.dimIn, T.dimIn + 0.5));
      place(cardGroup, {
        x: 200 * (1 - enter) - 80 * away,
        y: cardY(t) + SINK_Y * sink,
        s: (1 - SINK_S * sink) * (1 - 0.03 * away),
        opacity: ease.outQuad(prog(t, 0.05, 0.55)) * (1 - SINK_FADE * dimIn) * (1 - away),
        origin: '50% 50%',
      });
      cardGroup.style.filter = dim > 0.01 ? `blur(${(2 * dim).toFixed(2)}px)` : '';
      dimmer.set(dim);
      // The byline's face pops as the page comes to rest, so the new name registers before the finger.
      const av = spring(t, 0.5, 0.55, 0.22);
      place(card.avatar.el, { s: 0.5 + 0.5 * av, opacity: clamp(av * 1.6), origin: '50% 50%' });
      // The finger over 寄小紙條: the wash, the press.
      const hover = ease.outCubic(prog(t, T.tap1 - 0.24, T.tap1 - 0.04)) * (1 - ease.inOutCubic(prog(t, T.sheetIn + 0.05, T.sheetIn + 0.4)));
      wash.setAttribute('opacity', hover.toFixed(3));
      const pressed1 = Math.sin(Math.PI * prog(t, T.tap1 - 0.08, T.tap1 + 0.18));
      bar.segments[1].el.style.opacity = (1 - 0.18 * pressed1).toFixed(3);

      // ── The finger: comes in, presses, and is gone at once ──
      if (t < (T.tap1 + T.tap2) / 2) {
        const inP = ease.outCubic(prog(t, T.tap1 - 0.46, T.tap1 - 0.06));
        const gone = ease.outQuad(prog(t, T.tap1 + 0.1, T.tap1 + 0.28));
        tap.set({
          x: noteSegment.x + (1 - inP) * 60,
          y: noteSegment.y + cardY(t) + (1 - inP) * 76,
          opacity: inP * (1 - gone),
          press: pressed1,
          ring: prog(t, T.tap1, T.tap1 + 0.5),
        });
      } else {
        const sx = sheetLeft + sendAt.x * SHEET_Z;
        const sy = sheetTop + sendAt.y * SHEET_Z + sheetY(t) + 9;
        const inP = ease.outCubic(prog(t, T.tap2 - 0.44, T.tap2 - 0.05));
        const gone = ease.outQuad(prog(t, T.tap2 + 0.08, T.tap2 + 0.24));
        tap.set({
          x: sx + (1 - inP) * 56,
          y: sy + (1 - inP) * 72,
          opacity: inP * (1 - gone),
          press: Math.sin(Math.PI * prog(t, T.tap2 - 0.08, T.tap2 + 0.18)),
          ring: prog(t, T.tap2, T.tap2 + 0.5),
        });
      }

      // ── The sheet: pops in, takes the note, says it's sent, folds into an envelope ──
      const pop = spring(t, T.sheetIn, 0.55, 0.14);
      const swap = ease.inOutCubic(prog(t, T.swap + 0.04, T.swap + 0.42));
      const boxH = lerp(H1, H2, swap);
      // Folding: the sheet draws in to an envelope's size, the top and bottom a beat ahead of the sides, the corners tightening.
      const fv = ease.inOutCubic(prog(t, T.foldA + 0.03, T.foldA + 0.36));
      const fh = ease.inOutCubic(prog(t, T.foldA + 0.07, T.foldA + 0.4));
      const folded = Math.max(fv, fh);
      // Landed, the envelope opens out into the note's bubble: as wide and tall, its corners the bubble's, its lines and pen gone.
      const unfold = ease.inOutCubic(prog(t, T.land - 0.04, T.land + 0.24));
      setShape(
        lerp(lerp(SHEET_W, EWu, fh), bubbleU.w, unfold),
        lerp(lerp(boxH, EHu, fv), bubbleU.h, unfold),
        boxH,
        lerp(lerp(26, 9, folded), 20, unfold),
      );
      const warm = ease.inOutCubic(prog(t, T.foldA + 0.08, T.foldA + 0.36));
      sheetFill.setAttribute('fill', `color-mix(in oklch, var(--bubble-mine) ${(warm * 100).toFixed(1)}%, var(--color-card-bg))`);
      const ink = `color-mix(in oklch, var(--color-terracotta) ${(warm * 100).toFixed(1)}%, oklch(40% 0.06 60))`;
      [sheetPen, flap, foldL, foldR].forEach((p) => p.setAttribute('stroke', ink));
      sheetPen.style.opacity = (1 - unfold).toFixed(3);
      sheetGrain.style.opacity = (1 - unfold).toFixed(3);
      envLines.style.opacity = (1 - ease.outQuad(prog(t, T.land - 0.04, T.land + 0.18))).toFixed(3);
      drawFlap(ease.inOutCubic(prog(t, T.foldA + 0.12, T.foldA + 0.44)));
      drawFolds.forEach((d, i) => d(ease.outCubic(prog(t, T.foldA + 0.26 + i * 0.05, T.foldA + 0.48 + i * 0.05))));
      const sealP = spring(t, T.foldA + 0.42, 0.42, 0.22);
      sealG.setAttribute('transform', `translate(${sealAt}) scale(${sealP.toFixed(3)})`);
      sealG.style.visibility = sealP > 0.01 ? '' : 'hidden';

      // The flight: a short lift as it seals, then an arc down into the thread, onto the note's place (which breathes with the pane).
      const fly = ease.inOutCubic(prog(t, T.flyA, T.flyB));
      const p0 = { x: sheetCX, y: sheetCY };
      const p2 = {
        x: paneLeft + paneX(t) + (noteX + noteOrigin.x) * PANE_Z,
        y: paneTop + paneY(t, out) + (NOTE_TOP + noteOrigin.y) * PANE_Z,
      };
      // It swings out to the left, round the quote building in the thread, and comes in to its place from there.
      const p1 = { x: p0.x - 380, y: p2.y + 90 };
      const bx = (1 - fly) * (1 - fly) * p0.x + 2 * (1 - fly) * fly * p1.x + fly * fly * p2.x;
      const by = (1 - fly) * (1 - fly) * p0.y + 2 * (1 - fly) * fly * p1.y + fly * fly * p2.y;
      const lift = Math.sin(Math.PI * prog(t, T.foldA + 0.4, T.flyA + 0.12)) * 8;
      // Once opened out it hands over to the bubble itself (under it), which has the words.
      const handOver = ease.inOutQuad(prog(t, T.land + 0.2, T.land + 0.36));
      const sheetOpacity = Math.min(1, ease.outQuad(prog(t, T.sheetIn, T.sheetIn + 0.14))) * (1 - handOver);
      const scaleNow = (0.96 + 0.04 * pop) * lerp(1, ENV_LAND, ease.inOutQuad(fly));
      place(sheetOuter, {
        x: bx - p0.x,
        y: by - p0.y + ((H1 - boxH) / 2) * SHEET_Z + sheetY(t) * (1 - folded) - lift,
        s: scaleNow,
        r: (-3 * folded + Math.sin(Math.PI * fly) * -9 + drift(t, 1.8, 0.3) * 1.5 * folded * (1 - fly)) * (1 - unfold),
        opacity: sheetOpacity,
        origin: `${(SHEET_W * SHEET_Z) / 2}px ${(boxH * SHEET_Z) / 2}px`,
      });

      // The field: focused, the note typed in, the counter following.
      const focus = ease.inOutCubic(prog(t, T.focus, T.focus + 0.25));
      fieldOutline.setAttribute('stroke', `color-mix(in oklch, var(--field-border-focus) ${Math.round(focus * 100)}%, var(--field-border))`);
      const n = typing.count(t);
      const text = typing.graphemes.slice(0, n).join('');
      typedEl.textContent = text;
      placeholderEl.style.display = n > 0 ? 'none' : '';
      const typingNow = t >= T.typeA - 0.05 && t <= T.typeB + 0.15;
      const blinkOn = Math.floor((t - T.focus) / 0.53) % 2 === 0;
      const caretOn = t >= T.focus + 0.1 && t < T.tap2 && (typingNow || blinkOn);
      caret.style.opacity = caretOn ? '1' : '0';
      counter.textContent = `${text.trim().length} / 2000`;
      const ready = ease.outCubic(prog(t, T.typeA + 0.05, T.typeA + 0.3));
      const pressed2 = Math.sin(Math.PI * prog(t, T.tap2 - 0.08, T.tap2 + 0.18));
      sendBtn.el.style.opacity = ((0.45 + 0.55 * ready) * (1 - 0.18 * pressed2)).toFixed(3);
      sendBtn.el.style.transform = `scale(${(1 - 0.04 * pressed2).toFixed(3)})`;

      const composerOut = ease.inOutCubic(prog(t, T.swap - 0.02, T.swap + 0.16));
      place(composer, { opacity: 1 - composerOut });
      const sentIn = ease.outCubic(prog(t, T.swap + 0.1, T.swap + 0.36));
      const sentOut = ease.inOutCubic(prog(t, T.foldA, T.foldA + 0.16));
      place(sent, { y: (1 - sentIn) * 6, opacity: sentIn * (1 - sentOut) });

      // ── The thread: slides in as the sheet folds ──
      place(paneOuter, {
        x: paneX(t),
        y: paneY(t, out),
        opacity: ease.outQuad(prog(t, T.paneIn, T.paneIn + 0.3)) * (1 - out),
      });

      // The card the note was left on builds while the envelope travels: its quote, then its head, cover and words.
      // (One fade for all of it, so its paper never shows empty; its parts settle a beat apart.)
      const qIn = (a: number) => ease.outCubic(prog(t, T.flyA - 0.08 + a, T.flyA - 0.08 + a + 0.45));
      place(quote, { y: (1 - qIn(0)) * 16, opacity: qIn(0) });
      place(qHead, { y: (1 - qIn(0.05)) * 6 });
      place(qText, { y: (1 - qIn(0.12)) * 8 });
      // The bubble itself, under the opening envelope: there as the envelope gives way.
      const bubbleIn = ease.outCubic(prog(t, T.land + 0.17, T.land + 0.32));
      place(noteBubble.el, { opacity: bubbleIn });

      // Their answer, in the place the letter's foot held.
      const replyP = spring(t, T.reply - 0.06, 0.55, 0.16);
      place(replyRow, {
        y: (1 - replyP) * 10,
        s: 0.88 + 0.12 * replyP,
        opacity: clamp(ease.outCubic(prog(t, T.reply - 0.06, T.reply + 0.16))),
        origin: '0% 100%',
      });

      // The foot: under the note while it waits as a letter, easing down to the pane's bottom as the reply comes.
      const down = ease.inOutCubic(prog(t, T.reply - 0.3, T.reply + 0.34));
      place(slot, { y: letterLift * (1 - down) });
      // The letter's rule (a pen line where the composer will be, the line under it), alone until it gives way for the reply.
      const awaitP = ease.outCubic(prog(t, T.awaitIn, T.awaitIn + 0.45));
      const awaitOut = ease.inOutCubic(prog(t, T.reply - 0.26, T.reply + 0.02));
      letterRule.draw(ease.inOutCubic(prog(t, T.awaitIn - 0.04, T.awaitIn + 0.4)));
      place(letterRule.el, { opacity: 1 - awaitOut });
      place(awaiting, { y: (1 - awaitP) * 6, opacity: awaitP * (1 - awaitOut) });
      // Then 已連結 and the composer.
      const pillP = spring(t, T.connect, 0.7, 0.25);
      place(pill.el, { s: 1.4 - 0.4 * pillP, opacity: ease.outCubic(prog(t, T.connect, T.connect + 0.2)) });
      pill.icon.paths.forEach((p, i) => {
        p.setAttribute('pathLength', '1');
        p.style.strokeDasharray = '1 1';
        p.style.strokeDashoffset = String(1 - ease.outCubic(prog(t, T.connect + 0.15 + i * 0.1, T.connect + 0.6 + i * 0.1)));
      });
      const compP = ease.outCubic(prog(t, T.connect + 0.1, T.connect + 0.5));
      place(composerRow, { y: (1 - compP) * 12, opacity: compP });
    };

    return { root, update };
  },
};
