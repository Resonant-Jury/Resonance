/**
 * Stand-in "screenshots" so render.ts can be developed and proven before the
 * real captures exist. They are deliberately plain mock screens (and carry a
 * visible PLACEHOLDER tag) so nobody uploads one to a store by mistake.
 *
 * Real captures go in raw/ios/<key>.png and raw/android/<key>.png — render.ts
 * prefers those and only falls back to these when a file is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { INK, INK_LIGHT } from '../../../src/lib/design/strokes';
import { wavyLine, wavyVertical } from '../../../src/lib/design/wavyPath';
import { wobCircle } from '../../../src/lib/design/wobCircle';
import { wobRect } from '../../../src/lib/design/wobRect';
import { BUILD, RAW, mkdirp, readTokens, screenshot } from './lib';

export type Platform = 'ios' | 'android';
export const KEYS = ['feed', 'card', 'write', 'resonance', 'messages', 'thoughtmap'] as const;
export type Key = (typeof KEYS)[number];

/** Typical simulator / emulator capture sizes. */
export const PLACEHOLDER_DIMS: Record<Platform, { w: number; h: number }> = {
  ios: { w: 1320, h: 2868 }, // iPhone 6.9"
  android: { w: 1080, h: 2400 }, // Pixel-class
};

const T = readTokens();
const LOGICAL_W = 390;

/* ── tiny layout helpers, all in 390-wide logical px ──────────────────── */

let boxSeed = 3;
/** A hand-drawn rounded box (wobRect border) with HTML content on top. */
function box(
  w: number,
  h: number,
  o: {
    r?: number;
    fill?: string;
    stroke?: string;
    sw?: number;
    dash?: string;
    x?: number;
    y?: number;
    pad?: string;
    style?: string;
    flex?: boolean;
  },
  inner = '',
): string {
  const seed = boxSeed++;
  const r = o.r ?? 14;
  const d = wobRect(w, h, r, seed, Math.min(w, h) * 0.02);
  const pos = o.x != null ? `position:absolute;left:${o.x}px;top:${o.y}px;` : 'position:relative;';
  return (
    `<div style="${pos}width:${w}px;height:${h}px;${o.style ?? ''}">` +
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;overflow:visible">` +
    `<path d="${d}" fill="${o.fill ?? 'var(--card)'}" stroke="${o.stroke ?? 'var(--ink)'}" stroke-width="${
      o.sw ?? INK
    }"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linejoin="round"/></svg>` +
    `<div style="position:absolute;inset:0;padding:${o.pad ?? '12px 14px'};${
      o.flex ? 'display:flex;' : ''
    }">${inner}</div></div>`
  );
}

function pill(text: string, fill: string, seed: number, w?: number): string {
  const width = w ?? Math.round(text.length * 11 + 22);
  return (
    `<div style="position:relative;display:inline-block;width:${width}px;height:24px;margin-right:6px">` +
    `<svg width="${width}" height="24" viewBox="0 0 ${width} 24" style="position:absolute;left:0;top:0;overflow:visible">` +
    `<path d="${wobRect(width, 24, 11, seed, 0.6)}" fill="${fill}" stroke="var(--ink)" stroke-width="${INK_LIGHT}"/></svg>` +
    `<span style="position:absolute;inset:0;font-size:11.5px;line-height:24px;text-align:center;font-weight:600">${text}</span></div>`
  );
}

const avatar = (fill: string, seed: number, size = 28, label = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:none;overflow:visible">` +
  `<path d="${wobCircle(size / 2, size / 2, size / 2 - 1.2, seed, { mag: 0.8, segments: 7 })}" fill="${fill}" stroke="var(--ink)" stroke-width="${INK_LIGHT}"/>` +
  (label
    ? `<text x="${size / 2}" y="${size / 2 + 4}" font-size="${size * 0.36}" font-weight="700" text-anchor="middle" fill="var(--ink)">${label}</text>`
    : '') +
  `</svg>`;

const wave = (size: number, stroke = 'var(--terra)') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round">` +
  `<path d="M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1"/>` +
  `<path d="M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0"/>` +
  `<path d="M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0"/></svg>`;

/* ── screens ──────────────────────────────────────────────────────────── */

function feedScreen(): string {
  const cards = [
    { c: T['terracotta-light'], t: '我在深夜的便利商店想通了一件事', b: '那天加班到十二點，我在店裡站了很久，才發現自己一直在等一個人先開口。', tags: ['日常', '自我對話'], n: 12, u: 'lin_ya' },
    { c: T['sage'], t: '外婆的菜園教我的三件事', b: '她從不看天氣預報，只看螞蟻的路線。她說土地比人誠實，給多少就長多少。', tags: ['家人', '成長'], n: 8, u: 'mei' },
    { c: T['sky'], t: '換工作前的最後一個週末', b: '我把房間整理了一遍，發現最難丟掉的不是東西，而是那些沒說出口的話。', tags: ['轉折'], n: 5, u: 'kai' },
    { c: T['lavender'], t: '在花蓮的第一個清晨', b: '海很安靜，我也是。原來離開之後，才知道自己一直帶著什麼。', tags: ['旅行'], n: 3, u: 'yu' },
  ];
  return cards
    .map(
      (k, i) =>
        box(
          358,
          172,
          { x: 16, y: 178 + i * 186, r: 20, pad: '14px 16px' },
          `<div style="display:flex;align-items:center;gap:8px">${avatar(k.c, 5 + i, 28)}<b style="font-size:12.5px">@${k.u}</b><span style="margin-left:auto;font-size:11px;color:var(--muted)">${i + 1} 天前</span></div>` +
            `<div class="serif" style="font-size:17.5px;font-weight:800;margin:10px 0 4px;line-height:1.3">${k.t}</div>` +
            `<div style="font-size:12.5px;color:var(--muted);line-height:1.55;height:39px;overflow:hidden">${k.b}</div>` +
            `<div style="margin-top:9px;display:flex;align-items:center">${k.tags.map((t, j) => pill(t, k.c, 20 + i * 3 + j)).join('')}<span style="margin-left:auto;font-size:11.5px;color:var(--terra);font-weight:700">共振 ${k.n}</span></div>`,
        ),
    )
    .join('');
}

function cardScreen(): string {
  const hero =
    `<div style="position:absolute;left:16px;top:112px;width:358px;height:170px">` +
    `<svg width="358" height="170" viewBox="0 0 358 170" style="overflow:visible"><path d="${wobRect(358, 170, 20, 9, 2)}" fill="${T['sage']}" stroke="var(--ink)" stroke-width="${INK}"/>` +
    `<path d="${wobCircle(270, 70, 46, 4, { mag: 4 })}" fill="${T['yellow']}" opacity=".8"/>` +
    `<path d="${wavyLine(300, 3, 8, 6)}" transform="translate(30 128)" stroke="var(--ink)" stroke-width="${INK}" fill="none"/></svg></div>`;
  const paras = [
    '那年冬天，我第一次一個人住進台北的老公寓。暖氣壞了，我用兩條毯子把自己包起來，聽著隔壁傳來的電視聲。',
    '房東太太每個週日都會敲門，遞給我一碗熱湯。她什麼也不問，只說「趁熱喝」。',
    '很久以後我才明白，有些陪伴不需要說話。它只是在那裡，像窗外那盞總是亮著的路燈。',
  ];
  return (
    hero +
    `<div class="serif" style="position:absolute;left:18px;top:298px;width:354px;font-size:26px;font-weight:900;line-height:1.25">在台北的第一個冬天</div>` +
    `<div style="position:absolute;left:18px;top:346px;display:flex;align-items:center;gap:8px">${avatar(T['terracotta-light'], 8, 28)}<b style="font-size:12.5px">@lin_ya</b><span style="font-size:11px;color:var(--muted)">· 3 天前 · 4 分鐘閱讀</span></div>` +
    `<div style="position:absolute;left:18px;top:388px;width:354px;font-size:14px;line-height:1.85">${paras.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join('')}</div>` +
    `<div style="position:absolute;left:18px;top:598px">${['冬天', '陪伴', '台北'].map((t, i) => pill(t, T['sage'], 30 + i)).join('')}</div>` +
    box(358, 54, { x: 16, y: 650, r: 22, fill: 'var(--terra)', pad: '0' }, `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px">以一張卡片回應</div>`)
  );
}

function writeScreen(): string {
  const tools = Array.from({ length: 7 }, (_, i) => box(38, 34, { x: 16 + i * 46, y: 232, r: 10, sw: INK_LIGHT, pad: '0' }, `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--muted)">${['B', 'I', 'H', '“', '≡', '◧', '⌘'][i]}</div>`)).join('');
  return (
    `<div style="position:absolute;left:16px;top:112px;width:358px;display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--muted)">取消</span><b>草稿</b><b style="color:var(--terra)">發佈</b></div>` +
    `<div class="serif" style="position:absolute;left:20px;top:162px;width:350px;font-size:26px;font-weight:900;line-height:1.25">我學會了慢下來<span style="display:inline-block;width:2px;height:26px;background:var(--terra);vertical-align:-4px;margin-left:2px"></span></div>` +
    tools +
    `<div style="position:absolute;left:20px;top:290px;width:350px;font-size:14.5px;line-height:1.9">` +
    `<p style="margin:0 0 12px">以前我總覺得，走得慢就是落後。直到有一天，我在通勤的路上停下來，看了一整分鐘的落日。</p>` +
    `<p style="margin:0 0 12px">那一分鐘，我什麼也沒做，卻覺得自己回到了身體裡。</p>` +
    `<p style="margin:0;color:var(--muted)">今天我想寫下這件事，給也在趕路的你</p></div>` +
    box(358, 96, { x: 16, y: 520, r: 18, dash: '6 6', fill: 'transparent', pad: '0' }, `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px">＋ 加入照片</div>`) +
    `<div style="position:absolute;left:16px;top:636px">${pill('僅連結可見 ▾', T['yellow'], 41, 120)}${pill('#成長', T['sage'], 42)}${pill('#日常', T['sky'], 43)}</div>`
  );
}

function resonanceScreen(): string {
  const items = [
    { t: '我也曾在一個人的夜裡學會慢下來', u: 'mei', c: T['sage'] },
    { t: '謝謝你寫下這個，我想起了外婆', u: 'kai', c: T['sky'] },
    { t: '慢，其實是另一種勇敢', u: 'yu', c: T['lavender'] },
  ];
  return (
    box(358, 128, { x: 16, y: 112, r: 20, fill: T['terracotta-light'], pad: '14px 16px' }, `<div style="font-size:11px;color:var(--muted)">@lin_ya · 3 天前</div><div class="serif" style="font-size:19px;font-weight:900;margin:6px 0">我學會了慢下來</div><div style="font-size:12.5px;color:var(--muted);line-height:1.55">以前我總覺得，走得慢就是落後。直到有一天……</div>`) +
    `<div class="serif" style="position:absolute;left:20px;top:262px;font-size:20px;font-weight:900">3 張共振卡片</div>` +
    `<svg width="10" height="380" style="position:absolute;left:32px;top:300px;overflow:visible"><path d="${wavyVertical(380, 5, 3, 8)}" stroke="var(--terra)" stroke-width="${INK}" fill="none" stroke-linecap="round"/></svg>` +
    items
      .map((k, i) =>
        box(316, 108, { x: 58, y: 306 + i * 122, r: 18, pad: '12px 14px' },
          `<div style="display:flex;align-items:center;gap:8px">${avatar(k.c, 12 + i, 24)}<b style="font-size:12px">@${k.u}</b></div><div class="serif" style="font-size:15.5px;font-weight:800;margin:8px 0 4px;line-height:1.3">${k.t}</div><div style="font-size:12px;color:var(--muted)">已連結 · 回應了這張卡片</div>`),
      )
      .join('')
  );
}

function messagesScreen(): string {
  const msgs: [boolean, string][] = [
    [false, '嗨，我讀了你那張〈慢下來〉，很有共鳴'],
    [true, '謝謝你！那天真的是突然想到的'],
    [false, '我最近也常常在趕，想問你後來怎麼調整的？'],
    [true, '我開始每天留十分鐘給自己，什麼也不做'],
    [false, '聽起來很不容易，但我想試試看'],
    [true, '週末我會發一張新的卡片，到時候你來看看'],
  ];
  let y = 172;
  const bubbles = msgs
    .map(([mine, text], i) => {
      const w = Math.min(250, 40 + text.length * 14);
      const h = w > 200 ? 62 : 44;
      const x = mine ? 374 - w : 16;
      const b = box(w, h, { x, y, r: 18, fill: mine ? T['terracotta-light'] : 'var(--card)', pad: '10px 14px' }, `<div style="font-size:13.5px;line-height:1.5">${text}</div>`);
      y += h + 12;
      void i;
      return b;
    })
    .join('');
  return (
    `<div style="position:absolute;left:16px;top:108px;width:358px;display:flex;align-items:center;gap:10px;height:48px">${avatar(T['sage'], 15, 36, 'M')}<div><b style="font-size:14px">@mei</b><div style="font-size:11px;color:var(--muted)">已連結</div></div></div>` +
    `<div style="position:absolute;left:0;top:158px;width:390px;text-align:center;font-size:11px;color:var(--muted)">昨天</div>` +
    bubbles +
    box(358, 46, { x: 16, y: 690, r: 23, pad: '0 18px', flex: true }, `<div style="align-self:center;color:var(--muted);font-size:13px">寫點什麼……</div>`)
  );
}

function thoughtmapScreen(): string {
  const zone = (x: number, y: number, w: number, h: number, label: string, fill: string) =>
    box(w, h, { x, y, r: 26, fill, stroke: 'var(--ink)', sw: INK_LIGHT, dash: '7 6', pad: '0' }, '') +
    `<div style="position:absolute;left:${x + 16}px;top:${y + 10}px;font-size:12.5px;font-weight:800;color:var(--ink)">${label}</div>`;
  const node = (x: number, y: number, t: string, c: string) =>
    box(126, 74, { x, y, r: 14, fill: c, pad: '10px 12px' }, `<div class="serif" style="font-size:13px;font-weight:800;line-height:1.35">${t}</div>`);
  const arrow = (d: string, lx: number, ly: number, label: string) =>
    `<svg width="390" height="900" style="position:absolute;left:0;top:0;overflow:visible"><path d="${d}" stroke="var(--ink)" stroke-width="${INK}" fill="none" stroke-linecap="round"/></svg>` +
    `<div style="position:absolute;left:${lx}px;top:${ly}px;padding:2px 10px;border:${INK_LIGHT}px solid var(--ink);border-radius:12px;background:var(--cream);font-size:11px;font-weight:700">${label}</div>`;
  return (
    `<div style="position:absolute;inset:0;background-image:radial-gradient(circle, oklch(70% 0.03 70 / .55) 1.4px, transparent 1.8px);background-size:22px 22px"></div>` +
    `<div style="position:absolute;left:16px;top:108px;width:358px;display:flex;justify-content:space-between;align-items:center"><b class="serif" style="font-size:20px;font-weight:900">思想地圖</b><span style="font-size:12px;color:var(--muted)">4 張卡片 · 3 條連線</span></div>` +
    zone(14, 170, 362, 210, '起點', `${T['terracotta-light']}`.replace(')', ' / .45)')) +
    zone(14, 410, 362, 230, '轉折', `${T['sky']}`.replace(')', ' / .4)')) +
    node(34, 210, '深夜的便利商店', T['card-bg']) +
    node(226, 250, '外婆的菜園', T['card-bg']) +
    node(34, 470, '換工作前的週末', T['card-bg']) +
    node(226, 520, '在花蓮的清晨', T['card-bg']) +
    arrow('M 160,270 C 200,290 210,290 224,288', 172, 300, '因為') +
    arrow('M 96,286 C 90,350 80,400 92,468', 100, 372, '於是') +
    arrow('M 288,326 C 300,400 300,470 290,518', 300, 410, '呼應')
  );
}

const SCREENS: Record<Key, () => string> = {
  feed: feedScreen,
  card: cardScreen,
  write: writeScreen,
  resonance: resonanceScreen,
  messages: messagesScreen,
  thoughtmap: thoughtmapScreen,
};

function mockHtml(platform: Platform, key: Key): string {
  const { w, h } = PLACEHOLDER_DIMS[platform];
  const zoom = w / LOGICAL_W;
  const LH = Math.round(h / zoom);
  boxSeed = 3 + KEYS.indexOf(key) * 40;
  const ios = platform === 'ios';
  const statusH = ios ? 54 : 34;
  const showAppBar = key === 'feed' || key === 'thoughtmap';
  const nav = ['首頁', '寫', '訊息', '我'];
  const status =
    `<div style="position:absolute;left:0;top:0;width:390px;height:${statusH}px;display:flex;justify-content:space-between;align-items:${ios ? 'flex-end' : 'center'};padding:0 ${ios ? 30 : 20}px ${ios ? 8 : 0}px;font-size:${ios ? 15 : 13}px;font-weight:700;color:var(--ink)"><span>${ios ? '9:41' : '9:41'}</span><span style="letter-spacing:2px">▂▄▆ ▮</span></div>` +
    (ios
      ? `<div style="position:absolute;left:140px;top:11px;width:110px;height:32px;border-radius:16px;background:#111"></div>`
      : `<div style="position:absolute;left:187px;top:9px;width:16px;height:16px;border-radius:8px;background:#111"></div>`);
  const appBar = showAppBar
    ? `<div style="position:absolute;left:16px;top:${statusH + 6}px;width:358px;height:44px;display:flex;align-items:center;gap:8px">${wave(30)}<b class="playfair" style="font-size:20px;font-weight:800">Resonance</b><div style="margin-left:auto">${avatar(T['lavender'], 3, 30)}</div></div>` +
      (key === 'feed'
        ? `<div style="position:absolute;left:16px;top:${statusH + 62}px">${pill('最新', T['terracotta-light'], 71, 64)}${pill('推薦', 'var(--card)', 72, 64)}${pill('連結', 'var(--card)', 73, 64)}</div>`
        : '')
    : '';
  const bottom = LH - (ios ? 92 : 72);
  const navBar =
    `<div style="position:absolute;left:0;top:${bottom}px;width:390px;height:${LH - bottom}px;background:var(--card);border-top:${INK_LIGHT}px solid var(--ink)"></div>` +
    nav
      .map(
        (n, i) =>
          `<div style="position:absolute;left:${16 + i * 90}px;top:${bottom + 10}px;width:90px;text-align:center;font-size:10.5px;font-weight:${i === 0 ? 800 : 500};color:${i === 0 ? 'var(--terra)' : 'var(--muted)'}"><div style="height:26px">${wave(24, i === 0 ? 'var(--terra)' : 'var(--muted)')}</div>${n}</div>`,
      )
      .join('') +
    (ios ? `<div style="position:absolute;left:135px;top:${LH - 12}px;width:120px;height:5px;border-radius:3px;background:var(--ink)"></div>` : '');
  const tag =
    `<div style="position:absolute;left:0;top:${bottom - 38}px;width:390px;text-align:center"><span style="display:inline-block;padding:4px 12px;border-radius:12px;background:oklch(60% .2 25);color:#fff;font-size:11px;font-weight:800;letter-spacing:.08em">PLACEHOLDER 待換成實機截圖</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--cream:${T['cream']};--card:${T['card-bg']};--ink:${T['text']};--muted:${T['text-muted']};--terra:${T['terracotta']};--faint:oklch(88% .02 75)}
  html,body{margin:0;background:${T['cream']}}
  body{font-family:'PingFang TC','Noto Sans TC',system-ui,sans-serif;color:var(--ink);overflow:hidden;width:${w}px;height:${h}px}
  .serif{font-family:'Songti TC','Noto Serif TC',serif}.playfair{font-family:'Playfair Display',Georgia,serif}
  </style></head><body><div style="position:relative;width:390px;height:${LH}px;zoom:${zoom};background:var(--cream);overflow:hidden">
  ${SCREENS[key]()}${appBar}${status}${navBar}${tag}</div></body></html>`;
}

/** Path of the placeholder PNG for a slide, generating it on first use. */
export async function ensurePlaceholder(platform: Platform, key: Key, force = false): Promise<string> {
  const png = path.join(RAW, '_placeholder', platform, `${key}.png`);
  if (!force && fs.existsSync(png)) return png;
  const { w, h } = PLACEHOLDER_DIMS[platform];
  const html = path.join(BUILD, '_placeholder', `${platform}-${key}.html`);
  mkdirp(path.dirname(html));
  fs.writeFileSync(html, mockHtml(platform, key));
  await screenshot(html, png, w, h);
  return png;
}
