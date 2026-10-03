/**
 * Finds the links in a chat message, for the thread to make tappable.
 *
 * Which words are a link is decided by the server's own rules
 * (`findLinks` / `normalizeLink` in ./url.ts, which also pick the link a
 * message is previewed for), so what a bubble underlines is what gets a
 * preview card — read the rules there. The href is always the normalized
 * address, never the raw text.
 *
 * Links that are valid but easy to mistake for another place — an IP address
 * or a punycode (`xn--`) host — come back `suspicious`: the reader asks
 * before opening those.
 */
import { findLinks, LINK_MAX_LENGTH, normalizeLink } from './url';

export const MAX_LINK_LENGTH = LINK_MAX_LENGTH;

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

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** An IP-literal or punycode host — valid, but not a name a reader can vouch for. */
export function isSuspiciousHost(host: string): boolean {
  if (host.startsWith('[') || IPV4.test(host)) return true;
  return host.split('.').some((label) => label.toLowerCase().startsWith('xn--'));
}

function described(url: string): { url: string; host: string; suspicious: boolean } {
  const host = new URL(url).hostname;
  return { url, host, suspicious: isSuspiciousHost(host) };
}

/** Normalizes one written link (a preview's own URL, say); null when the rules refuse it. */
export function parseLink(raw: string): { url: string; host: string; suspicious: boolean } | null {
  const url = normalizeLink(raw);
  return url ? described(url) : null;
}

/** Splits a message into plain text and links, in order. */
export function linkify(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let cursor = 0;
  for (const m of findLinks(text)) {
    if (m.start > cursor) out.push({ type: 'text', text: text.slice(cursor, m.start) });
    out.push({ type: 'link', text: text.slice(m.start, m.end), ...described(m.url) });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ type: 'text', text: text.slice(cursor) });
  return out;
}

/** The first link of a message, which is the one that gets a preview card. */
export function firstLinkOf(text: string): { url: string; host: string; suspicious: boolean } | null {
  const hit = linkify(text).find((s) => s.type === 'link');
  return hit && hit.type === 'link' ? hit : null;
}
