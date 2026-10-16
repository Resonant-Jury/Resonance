/**
 * 24.4 – 36.0 s. 共振: 小夏's card on its page, the card page's bar under it.
 * A tap on 共振; the card makes room, and beside it the reader's answer is
 * written — an empty card whose pen line draws round, its cover doodled, its
 * title typed, its tags, its story, its byline — a card answering a card,
 * never a like. Only then a pen thread runs from it back to the card it
 * answers, ripples go out from it, and the bar reads 已共振. Below, the two
 * people come together: 已連結. Held, and then everything steps away (the bar
 * still 已共振: nothing is undone).
 */
import { penWave } from '@/lib/design/wavyPath';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { css, drawable, html, place, svg } from '../dom';
import { avatar, C, face, family, icon, INK_LIGHT, INK_STRONG, makePrng, measure, segmentedBar, storyCard, tapMark, uid, wobRect } from '../kit';
import { THEIR_CARD } from '../layout';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { clamp, drift, ease, lerp, prog, spring } from '../time';
import { resonanceCardCover, theirCardCover } from './resonate-covers';
import { writeOn } from './resonate-write';

const DUR = TIMELINE.resonate.end - TIMELINE.resonate.start;

/** Card A's pose once it has made room: its scale (of its 1.3 zoom), its top-left on the stage, a slight lean. */
const A_LEFT = { k: 0.85, x: 826, y: 200, r: -0.6 };
/** The reader's card: zoom, right edge (the rotated corners stay inside the demo's 1800), top, resting lean. */
const B_POSE = { zoom: 1.1, right: 1784, y: 232, r: 2 };
/** The two people and their 已連結, drawn at this zoom below the cards. */
const PAIR_ZOOM = 1.45;
/** How far the bar may stand past the card on either side (1×): the app's bar hugs its card. */
const BAR_OVERHANG = 15;

/** How fast the answer's title is typed (characters a second): a hand's pace, Chinese slower than Latin letters. */
const TITLE_CPS = { 'zh-TW': 12, en: 29 } as const;
/** How long the story takes to be written on. */
const STORY_S = 0.8;

/**
 * When things happen (local seconds). The answer is written at a hand's pace,
 * so how long its title takes is the title's own length; everything after it
 * follows the byline, and the end of the hold stays where it is.
 */
function schedule(titleGraphemes: number, cps: number) {
  const titleAt = 3.05;
  const titleEnd = titleAt + 0.06 + titleGraphemes / cps;
  const tags = titleEnd - 0.05;
  const storyAt = tags + 0.15;
  const by = storyAt + STORY_S;
  return {
    tapIn: [1.2, 1.7],
    press: [1.75, 1.88, 1.95, 2.1],
    room: [2.1, 3.0],
    // The answer, written: the empty card, its cover doodled, its title typed, its tags, its story, its byline.
    outline: [2.55, 3.1],
    paper: [2.6, 3.05],
    cover: [2.8, 3.6],
    caretIn: 2.95,
    title: [titleAt, titleEnd],
    tags,
    story: [storyAt, by],
    sep: [by - 0.05, by + 0.2],
    byline: by,
    // Then it reaches the card it answers.
    thread: [by + 0.5, by + 1.25],
    head: [by + 1.17, by + 1.45],
    ripples: by + 0.6,
    flip: [by + 1.3, by + 1.75],
    check: [by + 1.5, by + 1.9],
    // And the two people.
    pair: by + 1.95,
    link: [by + 2.65, by + 3.15],
    pill: by + 2.95,
    pillCheck: [by + 3.15, by + 3.55],
    // Everything steps away, the people first, the card answered last.
    leave: 10.3,
  } as const;
}

type Pt = { x: number; y: number };

/** A point of a box rotated by `deg` about the box's centre. */
function rotated(p: Pt, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export const resonate: Scene = {
  id: 'resonate',
  ...TIMELINE.resonate,
  build({ copy, locale }) {
    const s = copy.stories;
    const root = html('div', { class: 'scene', style: { background: C.cream } });
    const titleChars = [...segmenter.segment(s.resonanceCard.title)].map((g) => g.segment);
    const T = schedule(titleChars.length, TITLE_CPS[locale === 'en' ? 'en' : 'zh-TW']);

    // ── The chapter's words ──────────────────────────────────────────
    const words = narration({ icon: 'wave', eyebrow: copy.narration.resonate.eyebrow, title: copy.narration.resonate.title, body: copy.narration.resonate.body });
    css(words.el, { top: Math.round(96 + (984 - words.h) / 2 - 18) });

    // ── Card A on its page, the bar under it ─────────────────────────
    const Z = THEIR_CARD.zoom;
    const a = storyCard({ index: 1, ...s.theirCard, author: s.them, cover: theirCardCover().cover });
    // Chinese lines break between clauses, never inside a word (as the narration's do).
    const clauses = { wordBreak: 'keep-all', overflowWrap: 'anywhere' };
    css(a.excerpt, clauses);
    // In en the row runs out of room, and the bookmark keeps only its icon, as the app's does.
    const bar = segmentedBar([
      { labels: [copy.ui.resonate, copy.ui.resonated], icons: ['wave', 'check'] },
      { labels: [copy.ui.noteEntry], icons: ['note'] },
      { labels: [copy.ui.bookmark], icons: ['bookmark'], iconOnly: locale === 'en' },
    ]);
    const barK = Math.min(1, (a.w + BAR_OVERHANG * 2) / bar.w);
    const barW = bar.w * barK;
    const barH = bar.h * barK;
    const barLeft = (a.w - barW) / 2;
    const barTop = a.h + THEIR_CARD.barGap;
    const barWrap = html('div', { class: 'abs', style: { left: barLeft, top: barTop, width: barW, height: barH } }, [
      html('div', { style: { zoom: barK, width: bar.w, height: bar.h } }, [bar.el]),
    ]);
    const aH1 = barTop + barH;
    const aInner = html('div', { style: { position: 'relative', width: a.w, height: aH1, zoom: Z } }, [a.el, barWrap]);
    const aOuter = html('div', { class: 'abs', style: { left: THEIR_CARD.x, top: THEIR_CARD.y, width: a.w * Z, height: aH1 * Z } }, [aInner]);
    /** The card's centre, in the wrapper and on the stage at home. */
    const aOrigin = { x: (a.w * Z) / 2, y: (a.h * Z) / 2 };
    const aHome = { x: THEIR_CARD.x + aOrigin.x, y: THEIR_CARD.y + aOrigin.y };
    const aW = a.w * Z * A_LEFT.k;
    const aCardH = a.h * Z * A_LEFT.k;
    const aLeftC = { x: A_LEFT.x + aW / 2, y: A_LEFT.y + aCardH / 2 };
    const checkPaths = bar.segments[0].states[1].icon.paths.map((p) => drawable(p));

    // ── Card B: the reader's answer, written here ───────────────────
    const bDoodle = resonanceCardCover();
    const b = storyCard({ index: 0, ...s.resonanceCard, author: s.me, cover: bDoodle.cover });
    // A two-line title shares its words between the lines (no word left alone on the second).
    css(b.title, { textWrap: 'balance' });
    css(b.excerpt, clauses);
    // Measured while the card is still at 1× in the measuring layer.
    const titleOn = writeOn(b.title, b.content);
    const storyOn = writeOn(b.excerpt, b.content);
    const caretBar = html('div', { class: 'abs', style: { left: 0, top: 0, width: 1.6, borderRadius: 1, background: C.terracotta, zIndex: 3 } });
    b.content.append(caretBar);

    const bW = b.w * B_POSE.zoom;
    const bH = b.h * B_POSE.zoom;
    const bX = B_POSE.right - bW;
    const bInner = html('div', { style: { position: 'relative', width: b.w, height: b.h, zoom: B_POSE.zoom } }, [b.el]);
    const bOuter = html('div', { class: 'abs', style: { left: bX, top: B_POSE.y, width: bW, height: bH } }, [bInner]);
    const bC = { x: bX + bW / 2, y: B_POSE.y + bH / 2 };

    // When each of the title's characters lands: a hand's uneven rhythm, a beat longer after a space
    // (the no-break spaces that keep "Lunar New Year" together too) or a comma.
    const keys = (() => {
      const rnd = makePrng(1907);
      const title = titleChars;
      const gaps = title.map((g, i) => (0.7 + 0.6 * rnd()) * (i > 0 && /[\s，,]/.test(title[i - 1]) ? 1.5 : 1));
      const sum = gaps.reduce((x, y) => x + y, 0);
      const span = T.title[1] - T.title[0] - 0.06;
      let at = T.title[0] + 0.03;
      return gaps.map((g) => {
        const key = at;
        at += (g / sum) * span;
        return key;
      });
    })();

    // ── The thread: from B back to the card it answers ───────────────
    const p0 = rotated({ x: bX + bW * 0.3, y: B_POSE.y - 10 }, bC, B_POSE.r);
    const p3 = rotated({ x: A_LEFT.x + aW * 0.7, y: A_LEFT.y - 12 }, aLeftC, A_LEFT.r);
    const c1 = { x: p0.x - 50, y: p0.y - 100 };
    const c2 = { x: p3.x + 70, y: p3.y - 92 };
    const threadD = `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}`;
    const TS = 1.35; // the sketch's pen, at the cards' size
    const maskId = uid('thread');
    const reveal = svg('path', { d: threadD, fill: 'none', stroke: 'white', 'stroke-width': 14, 'stroke-linecap': 'round' });
    const drawReveal = drawable(reveal);
    const thread = svg('path', { d: threadD, fill: 'none', stroke: C.pen, 'stroke-width': INK_LIGHT * TS, 'stroke-dasharray': `${5 * TS} ${6 * TS}`, 'stroke-linecap': 'round', mask: `url(#${maskId})` });
    // An open arrowhead at A, along the curve's last direction.
    const dir = Math.atan2(p3.y - c2.y, p3.x - c2.x);
    const arm = 11 * TS;
    const head = [dir + Math.PI - 0.62, dir + Math.PI + 0.62].map((ang) => ({ x: p3.x + Math.cos(ang) * arm, y: p3.y + Math.sin(ang) * arm }));
    const headPath = svg('path', {
      d: `M ${head[0].x.toFixed(1)},${head[0].y.toFixed(1)} L ${p3.x.toFixed(1)},${p3.y.toFixed(1)} L ${head[1].x.toFixed(1)},${head[1].y.toFixed(1)}`,
      fill: 'none',
      stroke: C.pen,
      'stroke-width': INK_LIGHT * TS,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    const drawHead = drawable(headPath);
    const threadSvg = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', class: 'abs', style: 'left:0;top:0;overflow:visible;pointer-events:none' }, [
      svg('defs', {}, [svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1920, height: 1080 }, [reveal])]),
      thread,
      headPath,
    ]);

    // ── Ripples: going out from B toward A ───────────────────────────
    const rc = rotated({ x: bX + 4, y: B_POSE.y + bH * 0.42 }, bC, B_POSE.r);
    const RINGS = 3;
    const rings = Array.from({ length: RINGS }, () =>
      svg('path', { fill: 'none', stroke: C.terracotta, 'stroke-width': INK_STRONG * 1.2, 'stroke-linecap': 'round' }),
    );
    const rippleSvg = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', class: 'abs', style: 'left:0;top:0;overflow:visible;pointer-events:none' }, rings);
    const SPAN = (38 * Math.PI) / 180;
    /** One arc of radius r around rc, bulging toward A (the sketch's arc, mirrored). */
    const arc = (r: number) => {
      const x0 = rc.x - Math.cos(SPAN) * r;
      const ya = rc.y - Math.sin(SPAN) * r;
      const yb = rc.y + Math.sin(SPAN) * r;
      const cx = rc.x - r * 1.1 * 1.18;
      return `M ${x0.toFixed(1)},${ya.toFixed(1)} Q ${cx.toFixed(1)},${rc.y.toFixed(1)} ${x0.toFixed(1)},${yb.toFixed(1)}`;
    };

    // ── The two people, connected ────────────────────────────────────
    // Their own seeds, so two faces never come out alike.
    const them = avatar(44, s.them.initials, family(1).fill, 41);
    const me = avatar(44, s.me.initials, family(0).fill, 68);
    const AV = 44 * PAIR_ZOOM;
    const zoomed = (el: HTMLElement, w: number, h: number) =>
      html('div', { class: 'abs', style: { left: 0, top: 0, width: w * PAIR_ZOOM, height: h * PAIR_ZOOM } }, [html('div', { style: { zoom: PAIR_ZOOM, width: w, height: h } }, [el])]);
    const themEl = zoomed(them.el, 44, 44);
    const meEl = zoomed(me.el, 44, 44);

    const pairC = { x: Math.round((aLeftC.x + bC.x) / 2), y: 0 };
    const aBarBottom = A_LEFT.y + aH1 * Z * A_LEFT.k;
    pairC.y = Math.round(Math.max(aBarBottom, B_POSE.y + bH) + 52 + AV / 2);
    const MEET = 78; // each avatar's centre from the pair's centre, once they've met

    const linkW = MEET * 2 - AV - 16;
    const linkPath = svg('path', { d: penWave(linkW, 23, 2.6, 9.5), fill: 'none', stroke: C.terracotta, 'stroke-width': INK_STRONG * 1.1, 'stroke-linecap': 'round', transform: 'translate(0,6)' });
    const drawLink = drawable(linkPath);
    const linkSvg = svg('svg', { width: linkW, height: 12, viewBox: `0 0 ${linkW} 12`, class: 'abs', style: `left:${pairC.x - linkW / 2}px;top:${pairC.y - 6}px;overflow:visible` }, [linkPath]);

    // 已連結: a tonal pill with the user-check icon.
    const uc = icon('user-check', 16, C.onTonal);
    uc.paths[2].setAttribute('stroke-width', String(INK_STRONG * 1.1));
    const ucCheck = drawable(uc.paths[2]);
    const pillLabel = html('span', { text: copy.ui.connected });
    const pill = html('span', { class: 'button', style: { padding: '8px 17px 8px 13px', fontSize: 14, gap: 7, color: C.onTonal } }, [uc.el, pillLabel]);
    const { w: pw, h: ph } = measure(pill);
    const pillFace = face(
      wobRect(pw, ph, ph / 2, 307, autoMag(pw, ph), { segmentsH: autoSegments(pw), segmentsV: 2, curve: autoCurve(pw, ph), cornerJitter: 1, cornerOffset: 0 }),
      pw,
      ph,
      { fill: C.buttonTonal, grain: { opacity: 0.38, frequency: 1.1, seed: 307 } },
    );
    pill.prepend(pillFace.el);
    css(pill, { width: pw, height: ph });
    const pillEl = zoomed(pill, pw, ph);
    const pillPos = { x: pairC.x - (pw * PAIR_ZOOM) / 2, y: pairC.y + AV / 2 + 18 };

    const tap = tapMark();
    const seg0 = bar.centre(0);
    const tapAt = { x: THEIR_CARD.x + Z * (barLeft + seg0.x * barK), y: THEIR_CARD.y + Z * (barTop + seg0.y * barK) };

    root.append(words.el, rippleSvg, aOuter, threadSvg, bOuter, linkSvg, themEl, meEl, pillEl, tap.el);

    /** A spring that has come to rest reads exactly 1, so nothing keeps a transform once it is still. */
    const rest = (t: number, start: number, settle: number, bounce: number) => (t >= start + settle * 1.8 ? 1 : spring(t, start, settle, bounce));
    /** A caret's blink after `from`: on, then off and on again every 1.06 s, with soft edges. */
    const blink = (t: number, from: number) => clamp(0.5 + 1.8 * Math.cos((Math.max(0, t - from) / 1.06) * Math.PI * 2));

    const update = (t: number) => {
      words.update(t, 0.35, DUR);

      // Leaving: the pair first, then the thread and the ripples, the answer, and the card it answers.
      const leave = (delay: number) => ease.inOutCubic(prog(t, T.leave + delay, T.leave + delay + 0.55));
      const pairOut = leave(0);
      const threadOut = leave(0.08);
      const bOut = leave(0.16);
      const aOut = leave(0.26);
      const RISE = 16;

      // Card A: settles, makes room, drifts, and finally steps away with its bar (still 已共振).
      const settle = ease.outQuart(prog(t, 0, 1.2));
      const room = ease.inOutCubic(prog(t, T.room[0], T.room[1]));
      // A small give as the thread lands on it.
      const landed = t - T.thread[1];
      const nudge = landed > 0 ? Math.exp(-landed * 5) * Math.sin(landed * 14) * 4 : 0;
      const aC = { x: lerp(aHome.x, aLeftC.x, room), y: lerp(aHome.y, aLeftC.y, room) };
      const amb = room; // ambient motion only once it has moved
      place(aOuter, {
        x: aC.x - aHome.x - nudge,
        y: aC.y - aHome.y + (1 - settle) * 24 + drift(t, 7.4, 0.2) * 2.4 * amb - aOut * RISE,
        s: lerp(1, A_LEFT.k, room) * (0.975 + 0.025 * settle),
        r: A_LEFT.r * room + drift(t, 9.1, 0.6) * 0.25 * amb,
        opacity: 1 - aOut,
        origin: `${aOrigin.x}px ${aOrigin.y}px`,
      });

      // The tap on 共振.
      const tIn = ease.outCubic(prog(t, T.tapIn[0], T.tapIn[1]));
      const press = prog(t, T.press[0], T.press[1]) - prog(t, T.press[2], T.press[3]);
      const tOut = ease.inCubic(prog(t, T.press[3] - 0.04, T.press[3] + 0.28));
      tap.set({
        x: tapAt.x + (1 - tIn) * 64 + tOut * 10,
        y: tapAt.y + (1 - tIn) * 74 + tOut * 14,
        opacity: tIn * (1 - tOut),
        press: ease.outCubic(clamp(press)),
        ring: ease.outCubic(prog(t, T.press[0] + 0.07, T.press[0] + 0.67)),
      });
      place(bar.el, { opacity: 1 - 0.18 * ease.outCubic(clamp(press)) });

      // 共振 → 已共振 once the answer has reached the card, and so it stays: the old word rolls up
      // and out, then the new one rolls in from below, never the two over each other.
      const [plain, done] = bar.segments[0].states;
      const fOut = ease.inCubic(prog(t, T.flip[0], T.flip[0] + 0.2));
      const fIn = ease.outCubic(prog(t, T.flip[0] + 0.2, T.flip[1]));
      plain.row.style.opacity = (1 - fOut).toFixed(3);
      plain.row.style.transform = fOut > 0 ? `translateY(${(-9 * fOut).toFixed(2)}px)` : '';
      done.row.style.opacity = fIn.toFixed(3);
      done.row.style.transform = fIn < 1 ? `translateY(${(9 * (1 - fIn)).toFixed(2)}px)` : '';
      checkPaths.forEach((d) => d(ease.outCubic(prog(t, T.check[0], T.check[1]))));

      // Card B: set down empty, its pen line drawn round, its paper settling in, a slight lean settling.
      const bIn = ease.outCubic(prog(t, T.outline[0], T.outline[1]));
      const bAmb = ease.inOutCubic(prog(t, T.outline[1], T.outline[1] + 1.2));
      place(bOuter, {
        x: drift(t, 8.7, 0.3) * 1.5 * bAmb,
        y: (1 - bIn) * 18 + drift(t, 6.3, 0.9) * 2.8 * bAmb - bOut * RISE,
        r: B_POSE.r + (1 - bIn) * 1.6 + drift(t, 8.2, 0.1) * 0.3 * bAmb,
        s: 0.97 + 0.03 * bIn,
        opacity: (t >= T.outline[0] ? 1 : 0) * (1 - bOut),
        origin: '50% 50%',
      });
      b.pen.drawStroke(ease.inOutCubic(prog(t, T.outline[0], T.outline[1])));
      place(b.paper.el, { opacity: ease.outCubic(prog(t, T.paper[0], T.paper[1])) });

      // Its cover, doodled.
      bDoodle.draw(prog(t, T.cover[0], T.cover[1]));

      // Its title, typed.
      const typedCount = keys.filter((k) => t >= k).length;
      titleOn.show(t >= T.title[1] ? Infinity : titleOn.stops[typedCount]);

      // Its tags, one after another.
      b.tags.forEach((tag, i) => {
        const sp = rest(t, T.tags + i * 0.12, 0.6, 0.26);
        place(tag.el, { s: 0.55 + 0.45 * sp, y: (1 - Math.min(1, sp)) * 6, opacity: clamp(sp * 1.6), origin: '50% 60%' });
      });

      // Its story, written on at a quick hand's pace.
      const sp = prog(t, T.story[0], T.story[1]);
      const soft = 24;
      const sd = (storyOn.total + soft) * (0.3 * sp + 0.7 * ease.inOutSine(sp));
      storyOn.show(t >= T.story[1] ? Infinity : sd, soft);

      // The caret: waits in the title, types it, rides the story's front, and goes as the rule is drawn.
      let c: { x: number; y: number; h: number };
      let caretOn: number;
      if (t < T.story[0]) {
        c = titleOn.caret(titleOn.stops[typedCount]);
        const typing = t >= T.title[0] && t < T.title[1];
        caretOn = typing ? 1 : t < T.title[0] ? blink(t, T.caretIn) : blink(t, T.title[1]);
        caretOn *= ease.outCubic(prog(t, T.caretIn, T.caretIn + 0.15));
      } else {
        c = storyOn.caret(clamp(sd - soft * 0.3, 0, storyOn.total));
        caretOn = 1 - ease.inOutCubic(prog(t, T.story[1] - 0.05, T.story[1] + 0.2));
      }
      const pad = c.h * 0.08;
      css(caretBar, { left: c.x + 0.6, top: c.y + pad, height: c.h - pad * 2 });
      place(caretBar, { opacity: caretOn });

      // The wavy rule, then the byline.
      b.sep.draw(ease.inOutCubic(prog(t, T.sep[0], T.sep[1])));
      const av = rest(t, T.byline, 0.55, 0.22);
      place(b.avatar.el, { s: 0.5 + 0.5 * av, opacity: clamp(av * 1.6), origin: '50% 50%' });
      const nameP = ease.outCubic(prog(t, T.byline + 0.08, T.byline + 0.5));
      place(b.name, { x: (1 - nameP) * -10, opacity: nameP });
      const readP = ease.outCubic(prog(t, T.byline + 0.14, T.byline + 0.56));
      place(b.read, { x: (1 - readP) * -10, opacity: readP });
      const arrowP = ease.outCubic(prog(t, T.byline + 0.22, T.byline + 0.64));
      place(b.arrow, { x: (1 - arrowP) * -8, opacity: 0.28 * arrowP });

      // The thread draws from B to A, then the open arrowhead.
      drawReveal(ease.inOutCubic(prog(t, T.thread[0], T.thread[1])));
      drawHead(ease.outCubic(prog(t, T.head[0], T.head[1])));
      place(threadSvg, { opacity: 1 - threadOut, y: drift(t, 7.4, 0.2) * 1.2 - threadOut * RISE });

      // Ripples: three rings going out from B, staggered, softly, through the hold.
      const PERIOD = 2.4;
      const on = ease.outCubic(prog(t, T.ripples - 0.05, T.ripples + 0.6)) * (1 - threadOut);
      rings.forEach((ring, i) => {
        const local = t - T.ripples - (i * PERIOD) / RINGS;
        if (local < 0 || on <= 0) {
          ring.style.visibility = 'hidden';
          return;
        }
        const p = (local % PERIOD) / PERIOD;
        const r = lerp(22, 150, ease.outQuad(p));
        const alpha = Math.min(1, p / 0.12) * (1 - ease.inQuad(p)) * 0.9;
        ring.setAttribute('d', arc(r));
        ring.style.visibility = '';
        ring.setAttribute('stroke-opacity', (alpha * on).toFixed(3));
      });
      place(rippleSvg, { y: -threadOut * RISE });

      // The two people: appear under their cards, slide together, a pen wave joins them, 已連結.
      const show = ease.outCubic(prog(t, T.pair, T.pair + 0.45));
      const meet = spring(t, T.pair + 0.15, 0.9, 0.2);
      const startOff = pairC.x - aLeftC.x; // them starts under A, me under B
      const themX = lerp(pairC.x - startOff, pairC.x - MEET, meet);
      const meX = lerp(pairC.x + (bC.x - pairC.x), pairC.x + MEET, meet);
      const pairDrift = drift(t, 6.8, 0.5) * 2 * show;
      const away = { opacity: 1 - pairOut, y: -pairOut * RISE };
      // Each leans into the way it goes, and straightens as they meet.
      const lean = (1 - meet) * 7 * show;
      place(themEl, { x: themX - AV / 2, y: pairC.y - AV / 2 + (1 - show) * 18 + pairDrift + away.y, r: lean, s: 0.8 + 0.2 * show, opacity: show * away.opacity, origin: '50% 50%' });
      place(meEl, { x: meX - AV / 2, y: pairC.y - AV / 2 + (1 - show) * 18 + pairDrift + away.y, r: -lean, s: 0.8 + 0.2 * show, opacity: show * away.opacity, origin: '50% 50%' });
      drawLink(ease.inOutCubic(prog(t, T.link[0], T.link[1])));
      place(linkSvg, { opacity: away.opacity, y: away.y + pairDrift });
      const pop = spring(t, T.pill, 0.65, 0.22);
      place(pillEl, { x: pillPos.x, y: pillPos.y + (1 - pop) * 10 + away.y + pairDrift, s: 0.7 + 0.3 * pop, opacity: Math.min(1, pop * 1.5) * away.opacity, origin: '50% 50%' });
      ucCheck(ease.outCubic(prog(t, T.pillCheck[0], T.pillCheck[1])));
    };
    return { root, update };
  },
};
