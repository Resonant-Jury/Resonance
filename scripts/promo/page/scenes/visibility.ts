/**
 * 14.4 – 25.0 s. 公開、私人、匿名: the card just written stays where "write"
 * left it. The page dims and the card sinks back a little; the publish panel
 * pops in over it, finished, as the app draws it once the mirror moment has
 * read the story (PublishPanel). A finger comes in and turns 以匿名發布 on —
 * the byline preview turns to 「·」 匿名, the panel notes what an anonymous
 * card may be — and is gone; after a hold it comes back and taps 發布. The
 * sheet drops away, the card turns anonymous while still faint under the
 * lifting dim and comes forward already so, holds, steps to the right, and
 * two more of the same card slide out from under it: one card three ways,
 * its colour its own, each named above in the panel's own words and
 * explained below. The row has left by 24.4 s, so the next chapter fades in
 * over plain paper.
 */
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import enMessages from '../../../../src/messages/en.json';
import zhMessages from '../../../../src/messages/zh-TW.json';
import { fill } from '../copy';
import { css, drawable, html, place, svg } from '../dom';
import { avatar, button, C, face, family, icon, measure, modalSheet, scrim, segmentedBar, storyCard, tapMark, toggle, wavyLine, wobRect, type IconName } from '../kit';
import { MY_CARD, STAGE } from '../layout';
import { myCardCover } from './write-cover';
import { narration } from '../narration';
import type { Scene } from '../scene';
import { TIMELINE } from '../timeline';
import { clamp, drift, ease, lerp, prog, spring } from '../time';

const DUR = TIMELINE.visibility.end - TIMELINE.visibility.start;

/** When things happen (local seconds; global = 14.4 + local). */
const T = {
  /** The page dims and the card sinks back (after the chapter's cross-fade). */
  dim: 0.6,
  /** The sheet pops in over it, finished (the mirror moment's echo already there). */
  pop: 0.9,
  /** The finger turns 以匿名發布 on; the byline preview and the note follow; the finger is gone by 2.6. */
  tapAnon: 2.1,
  /** …held on the anonymous byline with nothing else moving, then the finger comes back for 發布. */
  tapPublish: 4.4,
  /** The sheet drops away (its words first); the dim lifts; the card comes forward. */
  close: 4.58,
  /** The card's byline turns anonymous while it is still faint and soft under the lifting dim (done by 4.95). */
  byline: 4.55,
  /** The published anonymous card held whole (from about 5.25), then it steps to its place in the row; the other two slide out from under it. */
  shrink: 6.05,
  dealPrivate: 6.15,
  dealPublic: 6.23,
  /** Names above, words below, left to right as the cards land (all read by about 7.35). */
  labels: 6.62,
  /** The row steps away, gone by 9.96 (global 24.36), before the next chapter's paper comes over it. */
  exit: 9.56,
} as const;

/** The publish panel at video size (its 1× text reads as 17–32 px). */
const PANEL_ZOOM = 1.45;
/** How far the card sinks while the dialog is up (its scale is set so the sheet covers it with room to spare). */
const SINK_Y = 24;
/** How faint the card grows behind the dialog, so a sheet still fading in or cut away shows next to nothing of it. */
const SINK_FADE = 0.55;

/**
 * The chapter's words at the tour's width, each sentence of the body on a line
 * of its own — zh 「公開給每個人，或只留給自己。」/「不敢署名的故事，就匿名發布。」,
 * en "Share it … to yourself." / "For a story … anonymously." (left to the
 * width alone, the en line takes "For a" with it, and no width keeps both
 * sentences whole without a margin of a few pixels).
 */
function bodyBySentence(body: HTMLElement) {
  const text = body.textContent ?? '';
  const sentences = text.split(/(?<=[。.!?！？])\s*/u).filter(Boolean);
  if (sentences.length < 2) return;
  body.textContent = '';
  body.append(...sentences.map((line) => html('span', { text: line, style: { display: 'block' } })));
}

/** The row of three: its span on the stage (the demonstration's own), the gap between cards, its middle. */
const ROW = { left: STAGE.demo.left, right: 1800, gap: 34, cy: 568 };

/** A finger's press: down fast, up softer; the ring goes out after it. */
function tapAt(t: number, t0: number) {
  const down = ease.outQuad(prog(t, t0, t0 + 0.09));
  const up = ease.inOutQuad(prog(t, t0 + 0.12, t0 + 0.32));
  return { press: down * (1 - up), ring: ease.outCubic(prog(t, t0 + 0.03, t0 + 0.62)) };
}

/** A label pill at video size: a filled wobble with grain, a mark (an icon, or a little avatar), the word. */
function labelPill(text: string, mark: { icon: IconName } | { el: HTMLElement }, fillColor: string, seed: number) {
  const ic = 'icon' in mark ? icon(mark.icon, 19, C.text) : null;
  // Every mark in the same 20 × 20 box, so the three pills stand the same height.
  const markEl = html('span', { style: { position: 'relative', zIndex: 1, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, [ic ? ic.el : (mark as { el: HTMLElement }).el]);
  const word = html('span', { text, style: { position: 'relative', zIndex: 1 } });
  const el = html('div', {
    class: 'abs',
    style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px 9px 15px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 18, lineHeight: 1.2, letterSpacing: '0.04em', color: C.text, whiteSpace: 'nowrap' },
  }, [markEl, word]);
  const { w, h } = measure(el);
  const f = face(
    wobRect(w, h, h / 2, seed, autoMag(w, h), { segmentsH: autoSegments(w), segmentsV: 2, curve: autoCurve(w, h), cornerJitter: 1, cornerOffset: 0 }),
    w,
    h,
    { fill: fillColor, grain: { opacity: 0.3, frequency: 1.1, seed } },
  );
  el.prepend(f.el);
  css(el, { width: w, height: h });
  return { el, w, h, icon: ic, mark: markEl };
}

/**
 * Divider: the atom's 240-wide wave stretched across `w` with an unscaled
 * stroke — drawn here at its real width (x scaled, y kept), so the pen can
 * draw it on.
 */
function divider(w: number, seed: number) {
  const amp = 1.4;
  const h = amp * 2 + 1.2 * 2;
  const sx = w / 240;
  const d = wavyLine(240, seed, amp, 7).replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x: string, y: string) => `${(Number(x) * sx).toFixed(2)},${y}`);
  const path = svg('path', { d, fill: 'none', stroke: 'color-mix(in oklch, var(--field-border-hover) 35%, transparent)', 'stroke-width': 1.2, 'stroke-linecap': 'round' });
  const el = html('div', { style: { width: w, margin: '2px auto', lineHeight: 0 } }, [
    svg('svg', { viewBox: `0 ${-h / 2} ${w} ${h}`, width: w, height: h, style: 'display:block;overflow:visible' }, [path]),
  ]);
  return { el, draw: drawable(path) };
}

export const visibility: Scene = {
  id: 'visibility',
  ...TIMELINE.visibility,
  build({ copy, locale }) {
    const s = copy.stories;
    const ui = copy.ui;
    const words = copy.narration.visibility;
    const panelCopy = (locale === 'en' ? enMessages : zhMessages).write.publishPanel;
    const root = html('div', { class: 'scene', style: { background: C.cream } });

    // ── The chapter's words ──────────────────────────────────────────
    const nar = narration({ icon: 'eye', eyebrow: words.eyebrow, title: words.title, body: words.body });
    bodyBySentence(nar.body);
    css(nar.el, { top: Math.round(96 + (984 - measure(nar.el).h) / 2 - 18) });

    // ── The card, as "write" leaves it ───────────────────────────────
    // The same call "write" makes, with the same doodle for a cover (write-cover.ts).
    const card = storyCard({ index: 0, width: MY_CARD.width, title: s.myCard.title, excerpt: s.myCard.excerpt, tags: s.myCard.tags, minutes: s.myCard.minutes, author: s.me, cover: myCardCover().cover });
    const cardInner = html('div', { style: { position: 'relative', width: card.w, height: card.h, zoom: MY_CARD.zoom } }, [card.el]);
    const cardOuter = html('div', { class: 'abs', style: { left: MY_CARD.x, top: MY_CARD.y, width: card.w * MY_CARD.zoom, height: card.h * MY_CARD.zoom } }, [cardInner]);
    const CW = card.w * MY_CARD.zoom;
    const CH = card.h * MY_CARD.zoom;
    const cardCx = MY_CARD.x + CW / 2;
    const cardCy = MY_CARD.y + CH / 2;

    // Its byline, ready to turn anonymous: the "·" avatar under the named one, the two names in one cell.
    const anonAv = avatar(30, '·', card.fam.fill, 31 * 7);
    css(anonAv.el, { position: 'absolute', left: 0, top: 0 });
    card.avatar.el.append(anonAv.el);
    const named = html('span', { text: s.me.name, style: { gridArea: '1 / 1' } });
    const nameless = html('span', { text: ui.anonymousAuthor, style: { gridArea: '1 / 1' } });
    card.name.textContent = '';
    card.name.append(html('span', { style: { display: 'grid' } }, [named, nameless]));

    // ── The publish panel ────────────────────────────────────────────
    const CONTENT_W = 480 - 56;
    const title = html('h2', { text: ui.publishTitle, style: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700, color: C.text, textWrap: 'balance' } });

    // The mirror moment, already read: the sparkle and the echo (the panel arrives
    // finished, so the one change in it is the switch the chapter is about).
    const sparkle = icon('sparkle', 16, C.terracotta);
    const glyph = html('span', { style: { flexShrink: 0, marginTop: 2, display: 'inline-block' } }, [sparkle.el]);
    const insightText = html('span', { text: fill(ui.insight, { coreInsight: s.myCard.insight }) });
    const insightRow = html('div', { style: { width: CONTENT_W, display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7, color: C.text } }, [glyph, insightText]);

    // The dividers, drawn whole.
    const div1 = divider(CONTENT_W, 31);
    const div2 = divider(CONTENT_W, 47);
    div1.draw(1);
    div2.draw(1);

    // Who can see: 公開 (chosen) | 只有自己, and the note an anonymous card brings.
    const label = html('span', { text: ui.visibilityLabel, style: { display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.06em', color: C.muted } });
    const bar = segmentedBar([{ labels: [ui.visibilityPublic], icons: ['globe'] }, { labels: [ui.visibilityPrivate], icons: ['lock'] }], { mode: 'choice' });
    bar.setFilled(0, 1);
    const barRow = html('div', { style: { display: 'flex', marginTop: 10 } }, [bar.el]);
    const note = html('p', { text: panelCopy.anonymousVisibility, style: { paddingTop: 10, fontSize: 12, color: C.muted } });
    const noteH = measure(html('div', { style: { width: CONTENT_W } }, [note])).h;
    const noteWrap = html('div', { style: { height: 0, overflow: 'hidden' } }, [note]);
    const visGroup = html('div', {}, [label, barRow, noteWrap]);

    // Publish anonymously: the switch, the byline the world will see, the hint.
    const sw = toggle(57);
    const toggleRow = html('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-body)', fontSize: 14, color: C.text } }, [html('span', { text: ui.anonymousToggle }), sw.el]);
    const nameStyle = { fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600 };
    const meAv = avatar(34, s.me.initials, 'oklch(88% 0.08 55)');
    const noAv = avatar(34, '·', C.creamDark, 97);
    const meName = html('span', { text: s.me.name, style: { ...nameStyle, color: C.text } });
    const noName = html('span', { text: ui.anonymousAuthor, style: { ...nameStyle, color: C.muted } });
    const avCell = html('span', { style: { display: 'grid', width: 34, height: 34 } }, [
      html('span', { style: { gridArea: '1 / 1', display: 'flex' } }, [meAv.el]),
      html('span', { style: { gridArea: '1 / 1', display: 'flex' } }, [noAv.el]),
    ]);
    const nameCell = html('span', { style: { display: 'grid', alignItems: 'center' } }, [html('span', { style: { gridArea: '1 / 1' } }, [meName]), html('span', { style: { gridArea: '1 / 1' } }, [noName])]);
    const bylineRow = html('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 } }, [avCell, nameCell]);
    const hint = html('p', { text: ui.anonymousHint, style: { marginTop: 10, fontSize: 12, color: C.muted } });
    const anonGroup = html('div', {}, [toggleRow, bylineRow, hint]);

    const cancel = button(ui.publishCancel, 'tonal');
    const publish = button(ui.publish, 'solid');
    const foot = html('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 } }, [cancel.el, publish.el]);

    const panel = html('div', { style: { display: 'flex', flexDirection: 'column', gap: 18 } }, [title, insightRow, div1.el, visGroup, anonGroup, div2.el, foot]);
    const sheet = modalSheet(480, [panel], { seed: 29 });
    const H0 = sheet.h;
    const PZ = PANEL_ZOOM;
    const sheetInner = html('div', { style: { position: 'relative', width: 480, zoom: PZ } }, [sheet.el]);
    const sheetOuter = html('div', { class: 'abs', style: { left: cardCx - (480 * PZ) / 2, top: 0, width: 480 * PZ } }, [sheetInner]);
    /** The sheet's outline for its height now (it grows with the note, as the app's does). */
    const sheetPath = (h: number) => wobRect(480, h, 26, 29, Math.min(480, h) * 0.025, { segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.6, cornerJitter: 0.9, cornerOffset: 5 });
    const sheetPaths = [sheet.paper.fill, sheet.paper.grain, sheet.pen.stroke].filter((p): p is SVGPathElement => !!p);

    // Where the sheet sits, and how far the card sinks, so the sheet hides the
    // card whole: room above for the sheet's drop as it leaves, a little below.
    const ROOM_TOP = 34;
    const ROOM_BOTTOM = 14;
    const SINK = clamp((H0 * PZ - ROOM_TOP - ROOM_BOTTOM) / CH, 0.84, 0.96);
    const sheetCy = cardCy + SINK_Y + (ROOM_BOTTOM - ROOM_TOP) / 2;

    // ── The dim ──────────────────────────────────────────────────────
    // An even wash around the sheet at its tallest: the mask's flat plateau
    // (70 % of each radius) reaches PLATEAU px past every side, its fade away from the edges.
    const PLATEAU = 80;
    const dimmer = scrim(cardCx, sheetCy, ((480 * PZ) / 2 + PLATEAU) / 0.7, (((H0 + noteH) * PZ) / 2 + PLATEAU) / 0.7);

    // ── The row of three ─────────────────────────────────────────────
    const cw = (ROW.right - ROW.left - ROW.gap * 2) / 3;
    const ZR = cw / card.w;
    const ch = card.h * ZR;
    const slotX = [0, 1, 2].map((i) => ROW.left + i * (cw + ROW.gap));
    /**
     * The card in the row, public and then private, signed; the anonymous one is
     * the card itself. The same card each time — its own family and picture: a
     * card's colour never changes with who can read it, so the names above,
     * the words below and the byline tell the three apart.
     */
    const kinds = [0, 1].map(() => {
      const c = storyCard({ index: 0, width: MY_CARD.width, title: s.myCard.title, excerpt: s.myCard.excerpt, tags: s.myCard.tags, minutes: s.myCard.minutes, author: s.me, cover: myCardCover().cover });
      const inner = html('div', { style: { position: 'relative', width: c.w, height: c.h, zoom: ZR } }, [c.el]);
      const outer = html('div', { class: 'abs', style: { left: 0, top: 0, width: cw, height: ch } }, [inner]);
      return { c, outer };
    });

    // Names above, in the panel's own words, only the chips tinted apart: 🌐 公開 · 🔒 只有自己 · 「·」 匿名.
    const chipAv = avatar(20, '·', C.creamDark, 97);
    const pills = [
      labelPill(ui.visibilityPublic, { icon: 'globe' }, family(2).fill, 401),
      labelPill(ui.visibilityPrivate, { icon: 'lock' }, family(1).fill, 403),
      labelPill(ui.anonymousAuthor, { el: chipAv.el }, card.fam.fill, 409),
    ];
    // A caption with a comma turns its line there (「每個人都讀得到，」/「只是不署名」, "Anyone can read it," / "just without …").
    const captions = [words.publicCaption, words.privateCaption, words.anonymousCaption].map((text) =>
      html('p', {
        class: 'abs',
        text: text.replace(/([，,])\s*/u, '$1\n'),
        style: {
          width: cw,
          textAlign: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 21,
          lineHeight: 1.45,
          letterSpacing: locale === 'en' ? '0' : '0.04em',
          color: C.muted,
          textWrap: 'balance',
          whiteSpace: 'pre-line',
          wordBreak: locale === 'en' ? 'normal' : 'keep-all',
          overflowWrap: 'anywhere',
        },
      }),
    );
    const capH = Math.max(...captions.map((c) => measure(c).h));
    const pillH = Math.max(...pills.map((p) => p.h));
    const PILL_GAP = 20;
    const CAP_GAP = 22;
    const blockH = pillH + PILL_GAP + ch + CAP_GAP + capH;
    const rowTop = Math.round(ROW.cy - blockH / 2 + pillH + PILL_GAP);
    pills.forEach((p, i) => css(p.el, { left: slotX[i] + cw / 2 - p.w / 2, top: rowTop - PILL_GAP - pillH + (pillH - p.h) / 2 }));
    captions.forEach((c, i) => css(c, { left: slotX[i], top: rowTop + ch + CAP_GAP }));
    kinds.forEach((k, i) => css(k.outer, { left: slotX[i], top: rowTop }));

    // ── The finger ───────────────────────────────────────────────────
    const tap = tapMark();

    root.append(
      // A spread deck: the public card lowest (it travels furthest), the anonymous one on top.
      ...kinds.map((k) => k.outer),
      cardOuter,
      dimmer.el,
      nar.el,
      sheetOuter,
      ...pills.map((p) => p.el),
      ...captions,
      tap.el,
    );

    /** A point of an element's box on the stage, as laid out this frame (fx, fy: 0 → 1 across it). */
    const pointOf = (el: Element, rb: DOMRect, fx = 0.5, fy = 0.5) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width * fx - rb.left, y: r.top + r.height * fy - rb.top };
    };

    const update = (t: number) => {
      nar.update(t, 0.35, DUR);

      // ── The panel's state: the one change in it, the switch ──
      const anon = ease.outQuart(prog(t, T.tapAnon + 0.04, T.tapAnon + 0.32));
      sw.set(anon);
      const pNote = ease.inOutCubic(prog(t, T.tapAnon + 0.1, T.tapAnon + 0.45));

      // The note under the bar, and the sheet growing with it.
      css(noteWrap, { height: pNote * noteH });
      place(note, { opacity: ease.outCubic(prog(t, T.tapAnon + 0.25, T.tapAnon + 0.6)) });
      const H = H0 + noteH * pNote;
      const d = sheetPath(H);
      sheetPaths.forEach((p) => p.setAttribute('d', d));
      css(sheet.el, { height: H });

      // The byline the world will see: the avatar turns over, the name changes.
      const flipP = ease.inOutCubic(prog(t, T.tapAnon + 0.08, T.tapAnon + 0.5));
      meAv.el.style.opacity = flipP < 0.5 ? '1' : '0';
      meAv.el.style.transform = `scaleX(${Math.max(0, Math.cos(flipP * Math.PI)).toFixed(3)})`;
      noAv.el.style.transform = `scaleX(${Math.max(0, -Math.cos(flipP * Math.PI)).toFixed(3)})`;
      noAv.el.style.opacity = flipP >= 0.5 ? '1' : '0';
      // One name leaves before the other comes, so the two never sit over each other.
      const nameP = ease.inOutCubic(prog(t, T.tapAnon + 0.12, T.tapAnon + 0.5));
      place(meName, { y: -8 * nameP, opacity: 1 - prog(nameP, 0, 0.5) });
      place(noName, { y: 8 * (1 - nameP), opacity: prog(nameP, 0.5, 1) });

      // The sheet: rises a little and grows to size, its paper whole within
      // 0.08 s and its words just after, so nothing shows through it. It is
      // dismissed as a sheet: its words go first, then the paper drops,
      // shrinks a little and fades out, eased all the way.
      const appear = ease.outQuad(prog(t, T.pop, T.pop + 0.08));
      const rise = ease.outCubic(prog(t, T.pop, T.pop + 0.55));
      const grow = spring(t, T.pop, 0.6, 0.12);
      const drop = ease.inQuad(prog(t, T.close, T.close + 0.32));
      const cut = ease.inOutQuad(prog(t, T.close + 0.05, T.close + 0.3));
      const wordsOut = ease.inOutQuad(prog(t, T.close, T.close + 0.24));
      const pressPub = tapAt(t, T.tapPublish).press;
      place(publish.el, { s: 1 - 0.06 * pressPub });
      const amb = drift(t, 6.3, 0.3) * 1.2 * rise;
      place(sheetOuter, {
        y: sheetCy - (H * PZ) / 2 + (1 - rise) * 16 + drop * 24 + amb,
        s: (0.97 + 0.03 * grow) * (1 - 0.05 * drop),
        opacity: appear * (1 - cut),
        origin: '50% 50%',
      });
      place(panel, { opacity: ease.outCubic(prog(t, T.pop + 0.06, T.pop + 0.3)) * (1 - wordsOut) });

      // The dim, and the card sinking back and softening under it; both come back once the sheet has gone.
      const dim = ease.inOutCubic(prog(t, T.dim, T.dim + 0.45)) * (1 - ease.inOutCubic(prog(t, T.close + 0.12, T.close + 0.55)));
      dimmer.set(dim);
      cardOuter.style.filter = dim > 0.01 ? `blur(${(2 * dim).toFixed(2)}px)` : '';
      // Settled (all but) before the sheet arrives; back only once it has (all but) gone.
      const sink = ease.outCubic(prog(t, T.dim, T.dim + 0.5)) * (1 - ease.inOutCubic(prog(t, T.close + 0.25, T.close + 0.67)));
      // Under the sheet the card fades further, in step with it, so a sheet still
      // fading in shows next to nothing of it; it lifts only as the sheet is
      // (mostly) gone, so no word of the sheet prints over the card.
      const under = 1 - 0.6 * appear * (1 - ease.inOutQuad(prog(t, T.close + 0.14, T.close + 0.38)));

      // ── The card: anonymous once published (turned while still faint), then into its place in the row ──
      const flipC = ease.inOutCubic(prog(t, T.byline, T.byline + 0.4));
      card.avatar.face.el.style.opacity = flipC < 0.5 ? '1' : '0';
      card.avatar.label.style.opacity = flipC < 0.5 ? '1' : '0';
      card.avatar.el.style.transform = `scaleX(${Math.abs(Math.cos(flipC * Math.PI)).toFixed(3)})`;
      anonAv.el.style.opacity = flipC >= 0.5 ? '1' : '0';
      const nameC = ease.inOutCubic(prog(t, T.byline + 0.04, T.byline + 0.4));
      place(named, { y: -7 * nameC, opacity: 1 - prog(nameC, 0, 0.5) });
      place(nameless, { y: 7 * (1 - nameC), opacity: prog(nameC, 0.5, 1) });

      const shrink = ease.inOutCubic(prog(t, T.shrink, T.shrink + 0.85));
      const settled = ease.outCubic(prog(t, T.shrink + 0.85, T.shrink + 1.6));
      const bob = (i: number) => drift(t, 7.2, i * 0.22) * 2.2 * settled;
      // Each column leaves on its own beat, left to right.
      const leave = (i: number) => ease.inOutCubic(prog(t, T.exit + i * 0.04, T.exit + 0.32 + i * 0.04));
      // Where the card stands now (top-left on the stage, its drawn width): one slow breath, sunk under the dialog, then the step.
      const breath = Math.sin(Math.PI * clamp(t / 5.6)) * -3 * (1 - shrink);
      const k0 = lerp(1, SINK, sink);
      const restX = cardCx - (CW * k0) / 2;
      const restY = cardCy + SINK_Y * sink - (CH * k0) / 2 + breath;
      const bx = lerp(restX, slotX[2], shrink);
      const by = lerp(restY, rowTop, shrink) + bob(2);
      const k = lerp(k0, ZR / MY_CARD.zoom, shrink);
      const bw = CW * k;
      place(cardOuter, { x: bx - MY_CARD.x, y: by - MY_CARD.y - leave(2) * 16, s: k, opacity: (1 - SINK_FADE * sink) * under * (1 - leave(2)), origin: '0 0' });

      // The other two slide out from under it, to the left: each starts exactly
      // where the card is (hidden by it), leans a little on the way, and lands in its slot.
      const deals = [T.dealPublic, T.dealPrivate];
      kinds.forEach((kd, i) => {
        const go = spring(t, deals[i], 1.25, 0.1);
        const x = lerp(bx, slotX[i], go);
        const y = lerp(by, rowTop + bob(i), go);
        place(kd.outer, {
          x: x - slotX[i],
          y: y - rowTop - leave(i) * 16,
          s: lerp(bw / cw, 1, go),
          r: Math.sin(Math.PI * clamp(go)) * (i === 0 ? -2 : -1.4),
          opacity: ease.outQuad(prog(t, deals[i], deals[i] + 0.1)) * (1 - leave(i)),
          origin: '0 0',
        });
      });

      // Names pop above, words rise below, left to right.
      pills.forEach((p, i) => {
        const at = T.labels + i * 0.1;
        const sp = spring(t, at, 0.6, 0.22);
        place(p.el, { y: (1 - sp) * 10 + bob(i) - leave(i) * 16, s: 0.7 + 0.3 * sp, opacity: clamp(sp * 1.6) * (1 - leave(i)), origin: '50% 100%' });
        p.icon?.paths.forEach((path, j) => {
          path.setAttribute('pathLength', '1');
          path.style.strokeDasharray = '1 1';
          path.style.strokeDashoffset = String(1 - ease.outCubic(prog(t, at + 0.08 + j * 0.06, at + 0.45 + j * 0.06)));
        });
      });
      const dot = spring(t, T.labels + 2 * 0.1 + 0.1, 0.6, 0.3);
      place(chipAv.el, { s: 0.5 + 0.5 * dot, r: (1 - dot) * -30, opacity: clamp(dot * 2) });
      captions.forEach((c, i) => {
        const cp = ease.outCubic(prog(t, T.labels + 0.1 + i * 0.1, T.labels + 0.5 + i * 0.1));
        place(c, { y: (1 - cp) * 14 + bob(i) - leave(i) * 16, opacity: cp * (1 - leave(i)) });
      });

      // ── The finger: comes in, presses the switch and is gone; comes back fresh for 發布, presses, and is gone ──
      // (never left waiting inside the sheet, where a pale disc reads as one more control).
      const rb = root.getBoundingClientRect();
      const second = t >= (T.tapAnon + T.tapPublish) / 2;
      const t0 = second ? T.tapPublish : T.tapAnon;
      // On the switch; on 發布's right end, in its padding, so 發布 / Publish stays readable under the press.
      const at = second ? pointOf(publish.el, rb, 0.86, 0.7) : pointOf(sw.el, rb, 0.42, 0.55);
      const come = ease.outCubic(prog(t, t0 - 0.5, t0 - 0.1));
      // After 發布 it lifts a beat sooner, going with the sheet rather than staying on its fading paper.
      const lift = second ? 0.22 : 0.28;
      const away = ease.inOutCubic(prog(t, t0 + lift, t0 + lift + 0.2));
      const press = tapAt(t, t0);
      tap.set({
        x: at.x + (1 - come) * 64 + away * 12,
        y: at.y + (1 - come) * 80 + away * 18,
        opacity: come * (1 - away),
        press: press.press,
        ring: t >= t0 ? press.ring : 0,
      });
    };

    return { root, update };
  },
};
