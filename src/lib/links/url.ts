/**
 * Links in chat text: which words are a link, and which links we will follow.
 *
 * One set of rules, written here for the server (which unfurls the first link
 * of a message, `firstLink`) and meant to be mirrored word for word by the
 * three linkifiers that make a link tappable — the web's `linkify.ts`, the
 * Android `Linkify` and the iOS one — so that what a bubble underlines is what
 * the server previews. Read the rules before changing either side.
 *
 * Where a link starts. The text `http://`, `https://` or `www.` (any case),
 * not directly after a letter, digit, `.`, `-`, `_`, `@`, `/`, `%` or `\`
 * (so `xhttps://`, `foo.www.` and `//http://` are not links). A `www.` link is
 * `https://` + what was written.
 *
 * Where it ends. At the first of: white space, a control character, one of
 * `< > " \` \ ^`, CJK and full-width punctuation (U+3000–303F, U+FF00–FFEF,
 * U+FE30–FE6F), curly quotes and the ellipsis (U+2018–201F, U+2026), « », an
 * arrow, symbol or emoji (U+2190–2BFF, U+1F000–1FFFF, U+FE00–FE0F). The host
 * is ASCII only: `https://example.com很棒` ends at `.com`, and a host written
 * in non-ASCII letters (an IDN, the usual homograph trick) is not a link at
 * all — its punycode form (`xn--…`) is. A path may hold CJK letters
 * (`/wiki/中文`).
 *
 * Trimmed from the end, repeatedly: `. , ; : ! ? ' " * ~`, and a closing
 * `)`, `]` or `}` that has no opener in the link (`(see https://a.com/x)`
 * loses its `)`, `https://a.com/f_(x)` keeps it).
 *
 * Accepted (the rest is not a link, though it stays text): http or https
 * only; no user name or password (`https://google.com@evil.example`) and no
 * `@` in the host part at all; no backslash; a port that is none, 80 or 443;
 * a host with a dot in it (`localhost`, `intranet` and IPv6 literals are out;
 * `127.0.0.1` has dots and is let through here — `safeFetch` is what refuses
 * private addresses); at most 2048 characters, written or normalized.
 *
 * The link is then `new URL(…).href`: lower-cased host, punycode, `127.1` and
 * `2130706433` turned into `127.0.0.1`, percent-encoding fixed. Offsets are
 * UTF-16 code units into the text (JS strings; the Kotlin and Swift twins use
 * their own string units).
 */
export const LINK_MAX_LENGTH = 2048;

export interface LinkMatch {
  /** Where the link's words start and end in the text (end exclusive). */
  start: number;
  end: number;
  /** The normalized http(s) URL (`https://` added to a `www.` link). */
  url: string;
}

export interface NormalizeOptions {
  /**
   * Allow any port. Only the fetcher's tests use it, to reach a server on a
   * random local port; every real caller keeps the default.
   */
  anyPort?: boolean;
}

/** Characters that may not stand directly before the link's first letter. */
const NOT_BEFORE = /[A-Za-z0-9._@/%\\-]/;

/** Trailing punctuation that belongs to the sentence, not the link. */
const TRAILING = '.,;:!?\'"*~';
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Whether this code point ends a link (see the rules above). */
function endsLink(cp: number): boolean {
  if (cp <= 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true; // white space, controls, DEL, C1
  if (cp === 0x3c || cp === 0x3e || cp === 0x22 || cp === 0x60 || cp === 0x5c || cp === 0x5e) return true; // < > " ` \ ^
  if (cp === 0xa0 || cp === 0xab || cp === 0xbb || cp === 0x1680 || cp === 0x2028 || cp === 0x2029) return true;
  if (cp >= 0x2000 && cp <= 0x200f) return true; // spaces, zero-width and direction marks
  if (cp >= 0x2018 && cp <= 0x201f) return true; // curly quotes
  if (cp === 0x2026 || cp === 0x202f || cp === 0x205f || cp === 0xfeff) return true;
  if (cp >= 0x2190 && cp <= 0x2bff) return true; // arrows, math, dingbats, symbols
  if (cp >= 0x3000 && cp <= 0x303f) return true; // CJK punctuation, ideographic space
  if (cp >= 0xfe00 && cp <= 0xfe0f) return true; // variation selectors
  if (cp >= 0xfe30 && cp <= 0xfe6f) return true; // CJK compatibility and small form variants
  if (cp >= 0xff00 && cp <= 0xffef) return true; // full-width and half-width forms
  if (cp >= 0x1f000 && cp <= 0x1ffff) return true; // emoji
  return false;
}

/** Where the link starting at `start` (after its `schemeLength` letters) stops. */
function linkEnd(text: string, start: number, schemeLength: number): number {
  let i = start + schemeLength;
  let inHost = true;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    if (endsLink(cp)) break;
    if (inHost) {
      if (cp === 0x2f || cp === 0x3f || cp === 0x23) inHost = false; // / ? #
      else if (cp > 0x7f) break; // a host is ASCII: the CJK after `.com` is not part of it
    }
    i += cp > 0xffff ? 2 : 1;
  }
  // Sentence punctuation and unbalanced closers go.
  for (;;) {
    const last = text[i - 1];
    if (i - start <= schemeLength) break;
    if (TRAILING.includes(last)) {
      i--;
      continue;
    }
    const opener = PAIRS[last];
    if (opener) {
      const slice = text.slice(start, i);
      if (count(slice, last) > count(slice, opener)) {
        i--;
        continue;
      }
    }
    break;
  }
  return i;
}

function count(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n++;
  return n;
}

/**
 * The written link as the URL we would follow, or null when the rules refuse
 * it (see above). Takes a bare link — `www.…` gets its `https://` — and is the
 * one gate for every URL the server fetches or signs: a link in a message, an
 * `og:image`, a redirect's target.
 */
export function normalizeLink(written: string, options: NormalizeOptions = {}): string | null {
  let value = written;
  if (/^www\./i.test(value)) value = `https://${value}`;
  if (value.length > LINK_MAX_LENGTH || !/^https?:\/\//i.test(value)) return null;
  // `\` reads as `/` to a URL parser: `https://evil.example\@good.example` is evil.example.
  if (value.includes('\\') || /[\u0000- \u007f-\u009f]/.test(value)) return null;
  const rest = value.slice(value.indexOf('//') + 2);
  const authority = rest.slice(0, rest.search(/[/?#]|$/));
  if (authority.includes('@')) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!options.anyPort && url.port !== '' && url.port !== '80' && url.port !== '443') return null;
  // A name needs a dot (a trailing one, the root, does not count): `localhost`, `intranet`, `[::1]` are out.
  const host = url.hostname.replace(/\.$/, '');
  if (!host.includes('.') || host.startsWith('.') || host.includes('..')) return null;
  const href = url.href;
  return href.length > LINK_MAX_LENGTH ? null : href;
}

/** Every link in the text that the rules accept, in order. */
export function findLinks(text: string): LinkMatch[] {
  const found: LinkMatch[] = [];
  const starts = /https?:\/\/|www\./gi;
  for (let m = starts.exec(text); m; m = starts.exec(text)) {
    const start = m.index;
    const schemeLength = m[0].length;
    // Past the whole candidate, accepted or not: a link inside another's query is not a second link.
    const end = linkEnd(text, start, schemeLength);
    starts.lastIndex = Math.max(end, start + schemeLength);
    if (start > 0 && NOT_BEFORE.test(text[start - 1])) continue;
    const written = text.slice(start, end);
    if (written.length > LINK_MAX_LENGTH) continue;
    const url = normalizeLink(written);
    if (url) found.push({ start, end, url });
  }
  return found;
}

/**
 * The link a message gets previewed for: the first one the rules accept, as
 * its normalized URL — or null. (A first link that is refused, such as
 * `http://localhost/`, does not hide a good second one.)
 */
export function firstLink(text: string): string | null {
  return findLinks(text)[0]?.url ?? null;
}
