/**
 * Design tokens → Swift + Kotlin (the token pipeline from the native report).
 *
 * Reads the OKLCH values the web actually uses — src/styles/tokens.css, the
 * card palette in StoryCard, the one-pen stroke widths — converts each to
 * Display P3 (with an sRGB fallback), and writes constants for both apps.
 * `color-mix(in oklch, X, black N%)` is resolved here the way CSS does it,
 * so native never needs a color-mix at runtime.
 *
 *   npx tsx scripts/native/tokens.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { INK, INK_LIGHT, INK_STRONG } from '../../src/lib/design/strokes';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

type Oklch = { L: number; C: number; H: number; alpha: number };

function parseOklch(s: string): Oklch {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/.exec(s);
  if (!m) throw new Error(`not an oklch() color: ${s}`);
  const L = m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]);
  return { L, C: Number(m[3]), H: Number(m[4]), alpha: m[5] ? Number(m[5]) : 1 };
}

/** CSS Color 5: color-mix(in oklch, c, black p) — black has no hue, so c's hue carries. */
function mixWithBlack(c: Oklch, blackShare: number): Oklch {
  const k = 1 - blackShare;
  return { L: c.L * k, C: c.C * k, H: c.H, alpha: c.alpha };
}

/** CSS Color 5: color-mix(in oklch, a p, b) — shorter-arc hue interpolation. */
function mix(a: Oklch, b: Oklch, p: number): Oklch {
  let dh = b.H - a.H;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const H = (((a.H + dh * (1 - p)) % 360) + 360) % 360;
  return { L: a.L * p + b.L * (1 - p), C: a.C * p + b.C * (1 - p), H, alpha: a.alpha * p + b.alpha * (1 - p) };
}

// OKLCH → OKLab → linear sRGB (Björn Ottosson) → linear Display P3.
function toLinearSrgb({ L, C, H }: Oklch): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function linearSrgbToLinearP3([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    0.8224621 * r + 0.177538 * g,
    0.0331941 * r + 0.9668058 * g,
    0.0170827 * r + 0.0723974 * g + 0.9105199 * b,
  ];
}
const encode = (x: number) => {
  const v = Math.min(1, Math.max(0, x));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const r4 = (n: number) => Math.round(n * 10000) / 10000;

interface Token {
  name: string;
  source: string;
  p3: [number, number, number];
  srgbHex: string;
  inSrgbGamut: boolean;
  alpha: number;
}

function token(name: string, c: Oklch, source: string): Token {
  const lin = toLinearSrgb(c);
  const inSrgbGamut = lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  const p3 = linearSrgbToLinearP3(lin).map(encode).map(r4) as [number, number, number];
  const hex = lin
    .map(encode)
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('');
  return { name, source, p3, srgbHex: `#${hex}`, inSrgbGamut, alpha: c.alpha };
}

const tokens: Token[] = [];

// --- tokens.css ----------------------------------------------------------------
const css = read('src/styles/tokens.css');
const cssVars: Record<string, Oklch> = {};
for (const m of css.matchAll(/--([\w-]+):\s*(oklch\([^)]*\))/g)) cssVars[m[1]] = parseOklch(m[2]);
const camel = (s: string) => s.replace(/^color-/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
for (const [name, value] of Object.entries(cssVars)) tokens.push(token(camel(name), value, `--${name}`));

// --- StoryCard palette --------------------------------------------------------
const storyCard = read('src/components/molecules/StoryCard/StoryCard.tsx');
const listOf = (name: string) => {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(storyCard)?.[1] ?? '';
  return [...block.matchAll(/oklch\([^)]*\)/g)].map((m) => parseOklch(m[0]));
};
listOf('CARD_FILLS').forEach((c, i) => tokens.push(token(`cardFill${i}`, c, `StoryCard CARD_FILLS[${i}]`)));
listOf('CARD_BORDERS').forEach((c, i) =>
  tokens.push(token(`cardBorder${Math.floor(i / 2)}${i % 2 ? 'Dark' : ''}`, c, `StoryCard CARD_BORDERS[${Math.floor(i / 2)}][${i % 2}]`)),
);

// --- component mixes ----------------------------------------------------------
const terracotta = cssVars['color-terracotta'];
tokens.push(token('terracottaInk', mixWithBlack(terracotta, 0.35), 'color-mix(in oklch, terracotta, black 35%) — primary button stroke'));
tokens.push(token('terracottaDeep', mixWithBlack(terracotta, 0.25), 'color-mix(in oklch, terracotta, black 25%) — toggle on stroke'));
tokens.push(token('toggleOff', parseOklch('oklch(86% 0.02 75)'), 'ToggleSwitch off fill'));
tokens.push(token('toggleOffStroke', parseOklch('oklch(70% 0.03 70)'), 'ToggleSwitch off stroke'));
tokens.push(token('ghostStroke', parseOklch('oklch(44% 0.04 70)'), 'OrganicButton ghost stroke'));
tokens.push(token('modalBorder', parseOklch('oklch(40% 0.06 60)'), 'Modal border'));
tokens.push(token('authInterior', mix(cssVars['color-terracotta-light'], cssVars['color-card-bg'], 0.14), 'AuthCard interior: color-mix(in oklch, terracotta-light 14%, card-bg)'));
tokens.push(token('authBorder', mixWithBlack(terracotta, 0.18), 'AuthCard border: color-mix(in oklch, terracotta, black 18%)'));

// --- numeric tokens (px lengths and plain numbers) ------------------------------
const lengths: { name: string; value: number; source: string }[] = [];
for (const m of css.matchAll(/--([\w-]+):\s*(-?[\d.]+)(px)?\s*;/g)) {
  lengths.push({ name: camel(m[1]), value: Number(m[2]), source: `--${m[1]}` });
}

// --- emit ----------------------------------------------------------------------
const header = 'Generated by scripts/native/tokens.ts from the web tokens — do not edit.';
const swift = `// ${header}
import SwiftUI

public enum Tokens {
${tokens
  .map(
    (t) =>
      `    /// ${t.source} · sRGB ${t.srgbHex}${t.inSrgbGamut ? '' : ' (outside sRGB)'}\n` +
      `    public static let ${t.name} = Color(.displayP3, red: ${t.p3[0]}, green: ${t.p3[1]}, blue: ${t.p3[2]}, opacity: ${t.alpha})`,
  )
  .join('\n')}

    public static let cardFills: [Color] = [${[0, 1, 2, 3, 4, 5].map((i) => `cardFill${i}`).join(', ')}]
    public static let cardBorders: [Color] = [${[0, 1, 2, 3, 4, 5].map((i) => `cardBorder${i}`).join(', ')}]

    /// One pen for the whole app (src/lib/design/strokes.ts).
    public static let ink: CGFloat = ${INK}
    public static let inkLight: CGFloat = ${INK_LIGHT}
    public static let inkStrong: CGFloat = ${INK_STRONG}
${lengths.map((l) => `\n    /// ${l.source}\n    public static let ${l.name}: CGFloat = ${l.value}`).join('')}
}
`;

const kt = `// ${header}
package com.resonance.design.generated

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.unit.dp

object Tokens {
${tokens
  .map(
    (t) =>
      `    /** ${t.source} · sRGB ${t.srgbHex}${t.inSrgbGamut ? '' : ' (outside sRGB)'} */\n` +
      `    val ${t.name[0].toUpperCase()}${t.name.slice(1)} = Color(${t.p3[0]}f, ${t.p3[1]}f, ${t.p3[2]}f, ${t.alpha}f, ColorSpaces.DisplayP3)`,
  )
  .join('\n')}

    val CardFills = listOf(${[0, 1, 2, 3, 4, 5].map((i) => `CardFill${i}`).join(', ')})
    val CardBorders = listOf(${[0, 1, 2, 3, 4, 5].map((i) => `CardBorder${i}`).join(', ')})

    /** One pen for the whole app (src/lib/design/strokes.ts). */
    val Ink = ${INK}.dp
    val InkLight = ${INK_LIGHT}.dp
    val InkStrong = ${INK_STRONG}.dp
}
`;

const outputs: [string, string][] = [
  // The app's packages default to main-actor isolation; constants are safe anywhere.
  ['apps/ios/Packages/DesignSystem/Sources/DesignSystem/Generated/Tokens.swift', swift.replace('public enum Tokens {', 'public nonisolated enum Tokens {')],
  [
    'apps/android/core/design/src/main/kotlin/com/resonance/design/generated/Tokens.kt',
    kt.replace(
      `    val InkStrong = ${INK_STRONG}.dp\n}`,
      `    val InkStrong = ${INK_STRONG}.dp\n${lengths.map((l) => `\n    /** ${l.source} */\n    const val ${l.name[0].toUpperCase()}${l.name.slice(1)} = ${l.value}f`).join('')}\n}`,
    ),
  ],
];
for (const [p, body] of outputs) {
  mkdirSync(dirname(resolve(root, p)), { recursive: true });
  writeFileSync(resolve(root, p), body);
}
const outOfGamut = tokens.filter((t) => !t.inSrgbGamut).map((t) => t.name);
console.log(`${tokens.length} tokens → Swift + Kotlin. Outside sRGB: ${outOfGamut.join(', ') || 'none'}`);
