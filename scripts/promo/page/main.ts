/**
 * The promo's stage. It loads the faces, builds every scene once, and then
 * answers `window.__promo.renderAt(t)` — the renderer (scripts/promo/render.ts)
 * calls it for each frame and takes a screenshot.
 *
 * Open the page with `?locale=en` for the English cut; `?t=12.5` shows that
 * moment, for looking at a frame in a browser.
 */
import { copyFor, fill, type Locale } from './copy';
import { html, place } from './dom';
import { header } from './header';
import { initDefs, initMeasure, setReadTime } from './kit';
import type { Scene, SceneInstance } from './scene';
import { SCENES } from './scenes';
import { CROSS_FADE, DURATION } from './timeline';
import { ease, prog } from './time';

declare global {
  interface Window {
    __promo: { ready: Promise<void>; duration: number; renderAt: (t: number) => void };
  }
}

const params = new URLSearchParams(location.search);
const locale: Locale = params.get('locale') === 'en' ? 'en' : 'zh-TW';
document.documentElement.lang = locale;
const copy = copyFor(locale);
const stage = document.getElementById('stage')!;
setReadTime((count) => fill(copy.ui.readMinutes, { count }));

/** Loads every face at every weight the promo uses, for every character it shows, before anything is measured. */
async function loadFonts() {
  const text = JSON.stringify(copy) + '0123456789·…⋯—–‘’“”「」，。、：；！？ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const faces = ['Playfair Display', 'DM Sans', 'Noto Serif TC', 'Noto Sans TC'];
  const weights = [400, 600, 700, 800];
  await Promise.all(faces.flatMap((f) => weights.map((w) => document.fonts.load(`${w} 40px "${f}"`, text))));
  await document.fonts.ready;
}

async function loadImages() {
  const imgs = [...document.images];
  await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
}

let built: { def: Scene; inst: SceneInstance }[] = [];
let chrome: ReturnType<typeof header> | null = null;

function renderAt(t: number) {
  for (const { def, inst } of built) {
    const on = t >= def.start && t < def.end;
    inst.root.style.display = on ? '' : 'none';
    if (!on) continue;
    const local = t - def.start;
    const fade = def.fadeIn ?? CROSS_FADE;
    if (fade > 0) place(inst.root, { opacity: ease.inOutCubic(prog(local, 0, fade)) });
    inst.update(local);
  }
  chrome?.update(t);
}

const ready = (async () => {
  initDefs(stage);
  initMeasure(stage);
  await loadFonts();
  const scenes = html('div', { class: 'layer' });
  stage.append(scenes);
  built = SCENES.map((def) => {
    let inst: SceneInstance;
    try {
      inst = def.build({ locale, copy });
    } catch (e) {
      // One scene that fails to build shows as plain paper; the rest still render.
      console.error(`scene ${def.id} failed to build`, e);
      inst = { root: html('div', { class: 'scene', style: { background: 'var(--color-cream)' } }), update: () => {} };
    }
    scenes.append(inst.root);
    return { def, inst };
  });
  chrome = header(copy);
  stage.append(chrome.root);
  await loadImages();
  renderAt(Number(params.get('t') ?? 0));
})();

window.__promo = { ready, duration: DURATION, renderAt };
