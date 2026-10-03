/**
 * Finds the links in a chat message, for the thread to make tappable.
 *
 * The rules are the ones the server's `firstLink` (src/lib/links/url.ts, which
 * decides what gets a preview card) and both apps' linkifiers follow, so a
 * link looks the same on every platform:
 *
 *  - A link starts at `http://`, `https://` or `www.` (the last one is read as
 *    `https://www.…`), not in the middle of a word.
 *  - It runs to the next whitespace or the first non-ASCII character, so a
 *    link written straight before Chinese text ends where the text starts.
 *  - Trailing punctuation is not part of it: `.,;:!?'"`, the full-width
 *    `，。！？、；：）」』】》` and `…`, and a `)` with no `(` before it.
 *  - Only http and https. No user name or password in the address
 *    (`https://bank.com@evil.com`), no port but the default, a host with a dot
 *    in it, at most 2048 characters. Anything else stays plain text.
 *  - The href is always the address `new URL` normalized, never the raw text.
 *
 * Links that are valid but easy to mistake for another place — an IP address
 * or a punycode (`xn--`) host — come back `suspicious`: the reader asks
 * before opening those.
 */

export const MAX_LINK_LENGTH = 2048;

export type LinkSegment =
  | { type: 'text'; text: string }
  | {
      type: 'link';
      /** The text as written in the message. */
      text: string;
      /** The normalized http(s) address, safe for an `href`. */
      url: string;
      /** The host, as the browser would send it (punycode for IDN). */
      host: string;
      suspicious: boolean;
    };

const CANDIDATE = /(?<![A-Za-z0-9@./_-])(?:https?:\/\/|www\.)[^\s\u0080-￿<>"]+/gi;
const TRAILING = /[.,;:!?'…]$/;

function trimTrailing(raw: string): string {
  let s = raw;
  for (;;) {
    if (TRAILING.test(s)) {
      s = s.slice(0, -1);
      continue;
    }
    if (s.endsWith(')') && count(s, ')') > count(s, '(')) {
      s = s.slice(0, -1);
      continue;
    }
    return s;
  }
}

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** An IP-literal or punycode host — valid, but not a name a reader can vouch for. */
export function isSuspiciousHost(host: string): boolean {
  if (host.startsWith('[') || IPV4.test(host)) return true;
  return host.split('.').some((label) => label.toLowerCase().startsWith('xn--'));
}

/** Normalizes one candidate; null when it is not a link we make tappable. */
export function parseLink(raw: string): { url: string; host: string; suspicious: boolean } | null {
  if (raw.length > MAX_LINK_LENGTH) return null;
  const withScheme = /^www\./i.test(raw) ? `https://${raw}` : raw;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port) return null; // `new URL` drops the default port, so any left is odd
  // An IPv6 literal has no dot but is caught as suspicious below, not here.
  if (!u.hostname.includes('.') && !u.hostname.startsWith('[')) return null;
  if (u.href.length > MAX_LINK_LENGTH) return null;
  return { url: u.href, host: u.hostname, suspicious: isSuspiciousHost(u.hostname) };
}

/** Splits a message into plain text and links, in order. */
export function linkify(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let cursor = 0;
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index ?? 0;
    const raw = trimTrailing(m[0]);
    const parsed = parseLink(raw);
    if (!parsed) continue;
    if (start > cursor) out.push({ type: 'text', text: text.slice(cursor, start) });
    out.push({ type: 'link', text: raw, ...parsed });
    cursor = start + raw.length;
  }
  if (cursor < text.length) out.push({ type: 'text', text: text.slice(cursor) });
  return out;
}

/** The first link of a message, which is the one that gets a preview card. */
export function firstLinkOf(text: string): { url: string; host: string; suspicious: boolean } | null {
  const hit = linkify(text).find((s) => s.type === 'link');
  return hit && hit.type === 'link' ? hit : null;
}
