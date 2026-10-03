import { normalizeLink } from './url';

/**
 * What a page says about itself, read from its `<head>` — the Open Graph tags
 * (og:title, og:description, og:site_name, og:image), Twitter's, and the
 * plain `<title>` and description — for the preview card under a chat
 * message. The page is a stranger's: every string here is data, cut to size
 * and stripped of anything that could pass for markup or hide in a line of
 * text, and the image is only ever a URL the link rules accept.
 *
 * A small tolerant scanner rather than a DOM: it looks for `<meta`, `<title`
 * and the comments and scripts that could hide them, with plain `indexOf`
 * scans (a page made of ten thousand unterminated tags must cost one pass,
 * not ten thousand).
 */

export const TITLE_MAX = 160;
export const DESCRIPTION_MAX = 300;
export const SITE_NAME_MAX = 80;
/** More tags than this in a head is not a head. */
const MAX_META_TAGS = 400;

export interface OpenGraph {
  title?: string;
  description?: string;
  siteName?: string;
  /** An absolute http(s) URL that passed the link rules (`normalizeLink`). */
  image?: string;
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·',
  bull: '•', times: '×', deg: '°', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', iexcl: '¡',
  iquest: '¿', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', aacute: 'á', acirc: 'â', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ', oacute: 'ó', iacute: 'í', uacute: 'ú',
};

/** HTML character references, decoded once (`&amp;lt;` is `&lt;`). Unknown names are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      return String.fromCodePoint(code);
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/**
 * Characters that draw nothing or reorder what is drawn: removed rather than
 * shown. Controls (except the white space ones, tab to carriage return,
 * which collapse), DEL and C1, the soft hyphen, the Arabic letter mark, the Mongolian
 * vowel separator, zero-width and direction marks (U+200B–200F), the
 * embedding and override controls (U+202A–202E: the right-to-left override
 * that makes "gnp.exe" read "exe.png"), word joiner, invisible operators and
 * isolates (U+2060–206F), the BOM, interlinear annotation marks, and the tag
 * characters (U+E0000–E007F) that can carry hidden text.
 */
const INVISIBLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

/**
 * Page text as one plain line: references decoded, tags and angle brackets
 * gone (a title is shown as text everywhere, but nothing downstream should
 * ever see markup in it), control, direction-override and zero-width
 * characters removed, white space collapsed, cut to `max` code points
 * (the last one an ellipsis when it was cut).
 */
export function cleanText(raw: string, max: number): string {
  let text = decodeEntities(raw).toWellFormed();
  text = text.replace(/<[^<>]*>/g, ' ').replace(/[<>]/g, '');
  // Line and paragraph separators and NEL are breaks (spaces); the other invisible characters vanish, even inside a word.
  text = text.replace(/[\u0085\u2028\u2029]/g, ' ').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  const points = Array.from(text);
  return points.length > max ? `${points.slice(0, max - 1).join('').trimEnd()}…` : text;
}

const TEXT_DECODER_LABEL = /^[A-Za-z0-9_.:-]{1,40}$/;

/** The page's characters: a BOM, then the Content-Type's charset, then a `<meta>` near the top, then UTF-8. */
export function decodeHtml(bytes: Uint8Array, headerCharset?: string | null): string {
  const label = (() => {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
    if (headerCharset && TEXT_DECODER_LABEL.test(headerCharset)) return headerCharset;
    const top = Buffer.from(bytes.subarray(0, 4096)).toString('latin1');
    const meta = /<meta[^>]{0,400}?charset\s*=\s*["']?\s*([A-Za-z0-9_.:-]{1,40})/i.exec(top)?.[1];
    return meta ?? 'utf-8';
  })();
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // A label the runtime does not know (or utf-7 and its kind): read it as UTF-8.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** The same string with A–Z folded to a–z and nothing else, so offsets match the original. */
const foldAscii = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

interface Inert {
  open: string;
  close: string;
  /** The opener is a tag name: `<scripts>` is not `<script>`. */
  tag: boolean;
}
const INERT: Inert[] = [
  { open: '<!--', close: '-->', tag: false },
  { open: '<script', close: '</script', tag: true },
  { open: '<style', close: '</style', tag: true },
  { open: '<template', close: '</template', tag: true },
  { open: '<noscript', close: '</noscript', tag: true },
];

/**
 * `html` without the parts that are not the head's own markup: comments,
 * scripts, styles, templates. Every search moves forward only (the next
 * opener of each kind is remembered, not looked for again from scratch), so
 * the cost is one pass however many of them a page holds; one that is never
 * closed swallows the rest.
 */
function withoutInert(html: string): string {
  const lower = foldAscii(html);
  const next = INERT.map(() => -2); // -2: not looked for yet, -1: none left
  const find = (kind: number, from: number): number => {
    const { open, tag } = INERT[kind];
    let at = next[kind];
    if (at !== -1 && at < from) {
      at = lower.indexOf(open, from);
      while (at !== -1 && tag && !/[\s>/]/.test(lower[at + open.length] ?? '>')) at = lower.indexOf(open, at + 1);
      next[kind] = at;
    }
    return at;
  };
  let out = '';
  let at = 0;
  for (;;) {
    let kind = -1;
    let start = -1;
    for (let k = 0; k < INERT.length; k++) {
      const found = find(k, at);
      if (found !== -1 && (start === -1 || found < start)) {
        kind = k;
        start = found;
      }
    }
    if (kind === -1) return out + html.slice(at);
    out += html.slice(at, start);
    const close = lower.indexOf(INERT[kind].close, start + INERT[kind].open.length);
    if (close === -1) return out; // never closed: the rest is inside it
    at = close + INERT[kind].close.length;
  }
}

/**
 * The attributes of the tag whose name ends at `from`: name → raw value (first
 * wins), where the tag ends, and whether it did end (a page cut short in the
 * middle of a tag has an unfinished one, which is not to be believed).
 */
function readAttributes(src: string, from: number): { attrs: Map<string, string>; end: number; closed: boolean } {
  const attrs = new Map<string, string>();
  let i = from;
  const n = src.length;
  while (i < n) {
    while (i < n && /[\s/]/.test(src[i])) i++;
    if (src[i] === '>') return { attrs, end: i + 1, closed: true };
    const nameStart = i;
    while (i < n && !/[\s=/>]/.test(src[i])) i++;
    const name = src.slice(nameStart, i).toLowerCase();
    while (i < n && /\s/.test(src[i])) i++;
    let value = '';
    if (src[i] === '=') {
      i++;
      while (i < n && /\s/.test(src[i])) i++;
      const quote = src[i];
      if (quote === '"' || quote === "'") {
        const close = src.indexOf(quote, i + 1);
        if (close === -1) return { attrs, end: n, closed: false };
        value = src.slice(i + 1, close);
        i = close + 1;
      } else {
        const valueStart = i;
        while (i < n && !/[\s>]/.test(src[i])) i++;
        value = src.slice(valueStart, i);
      }
    }
    if (name && !attrs.has(name)) attrs.set(name, value);
    if (i === nameStart) i++; // no progress on a stray character
  }
  return { attrs, end: n, closed: false };
}

/**
 * Read the preview fields out of a page's bytes. `baseUrl` is where the page
 * was fetched from (an `og:image` may be relative to it), `charset` the
 * Content-Type's. Nothing here fetches anything.
 */
export function parseOpenGraph(bytes: Uint8Array, options: { baseUrl: string; charset?: string | null }): OpenGraph {
  const decoded = decodeHtml(bytes, options.charset);
  const lowerAll = foldAscii(decoded);
  const headEnd = lowerAll.indexOf('</head');
  const head = withoutInert(headEnd === -1 ? decoded : decoded.slice(0, headEnd));
  const lower = foldAscii(head);

  const meta = new Map<string, string>();
  let at = 0;
  for (let seen = 0; seen < MAX_META_TAGS; seen++) {
    const open = lower.indexOf('<meta', at);
    if (open === -1) break;
    const after = lower[open + 5] ?? '>';
    at = open + 5;
    if (!/[\s/>]/.test(after)) continue;
    const { attrs, end, closed } = readAttributes(head, open + 5);
    at = end;
    if (!closed) break;
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').trim().toLowerCase();
    const content = attrs.get('content');
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }

  let titleTag: string | undefined;
  for (let open = lower.indexOf('<title'); open !== -1; open = lower.indexOf('<title', open + 6)) {
    if (!/[\s>]/.test(lower[open + 6] ?? '')) continue;
    const textStart = lower.indexOf('>', open);
    const close = textStart === -1 ? -1 : lower.indexOf('</title', textStart);
    if (close !== -1) titleTag = head.slice(textStart + 1, close);
    break;
  }

  const pick = (max: number, ...values: (string | undefined)[]) => {
    for (const value of values) {
      const text = value === undefined ? '' : cleanText(value, max);
      if (text) return text;
    }
    return undefined;
  };

  const result: OpenGraph = {};
  const title = pick(TITLE_MAX, meta.get('og:title'), meta.get('twitter:title'), titleTag);
  const description = pick(DESCRIPTION_MAX, meta.get('og:description'), meta.get('twitter:description'), meta.get('description'));
  const siteName = pick(SITE_NAME_MAX, meta.get('og:site_name'));
  if (title) result.title = title;
  if (description) result.description = description;
  if (siteName) result.siteName = siteName;

  for (const candidate of [meta.get('og:image:secure_url'), meta.get('og:image'), meta.get('og:image:url'), meta.get('twitter:image'), meta.get('twitter:image:src')]) {
    const image = resolveImage(candidate, options.baseUrl);
    if (image) {
      result.image = image;
      break;
    }
  }
  return result;
}

/** An image URL from a tag: resolved against the page, and only if the link rules take it. */
function resolveImage(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null;
  const written = decodeEntities(value).trim();
  if (!written || written.length > 2048) return null;
  try {
    return normalizeLink(new URL(written, baseUrl).href);
  } catch {
    return null;
  }
}
