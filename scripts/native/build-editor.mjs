/**
 * Build the native apps' editor island (native/editor/src) into one
 * self-contained HTML file: native/editor/dist/editor.html. Fonts are not
 * inlined — the page loads them from `?fonts=<base>` next to it in the app
 * bundle (iOS: fonts/, Android: the asset root).
 *
 *   node scripts/native/build-editor.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = resolve(root, 'native/editor/src');
const out = resolve(root, 'native/editor/dist/editor.html');

const result = await build({
  entryPoints: [resolve(src, 'island.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari17', 'chrome110'],
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text;
const css = readFileSync(resolve(src, 'island.css'), 'utf8');
const faces = [
  ['Playfair Display', 'PlayfairDisplay.ttf', '400 900'],
  ['DM Sans', 'DMSans.ttf', '100 1000'],
  ['Noto Sans TC', 'NotoSansTC.ttf', '100 900'],
  ['Noto Serif TC', 'NotoSerifTC.ttf', '200 900'],
];
// Font URLs are resolved at runtime against ?fonts= so each host can point at its bundle layout.
const fontLoader = `(()=>{const b=new URLSearchParams(location.search).get('fonts')||'';const s=document.createElement('style');s.textContent=${JSON.stringify(
  faces.map(([f, file, w]) => `@font-face{font-family:'${f}';src:url('__B__${file}');font-weight:${w};font-display:block}`).join(''),
)}.split('__B__').join(b);document.head.append(s)})();`;
const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>Story editor</title>
<script>${fontLoader}</script>
<style>${css}</style>
</head>
<body>
<div id="editor"></div>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
