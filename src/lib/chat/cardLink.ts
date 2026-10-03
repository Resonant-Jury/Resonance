import type { Message } from '@/lib/db/types';
import { findLinks } from '@/lib/links/url';

/**
 * Hosts whose `/card/{key}` pages are Resonance cards: the site, its www
 * name (which redirects to it) and the old address, which serves the same
 * deployment.
 */
export const CARD_LINK_HOSTS: readonly string[] = ['resonance.channel', 'www.resonance.channel', 'resonance-world.vercel.app'];

/** A card's URL segment as the contract names it (schemas.ts CardKey): anything else would fail GET /cards?keys= for every card asked with it. */
const CARD_KEY = /^[A-Za-z0-9_-]{1,160}$/;

/** `/card/{key}`, optionally under a locale, optionally with a closing slash. */
const CARD_PATH = /^(?:\/(?:en|zh-TW))?\/card\/([^/]+)\/?$/;

/**
 * The hosts a card link may name besides {@link CARD_LINK_HOSTS}: the site's
 * own (NEXT_PUBLIC_SITE_URL), and the page's own in emulator builds — where
 * this browser's API answers for the cards.
 */
function ownHosts(): string[] {
  const hosts: string[] = [];
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      hosts.push(new URL(site).host);
    } catch {
      // Not a URL: nothing to add.
    }
  }
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true' && typeof window !== 'undefined') hosts.push(window.location.host);
  return hosts;
}

/**
 * The card a link names (its slug or id) when it is a Resonance card page —
 * `https://resonance.channel/zh-TW/card/{key}` and its kin — or null. The
 * query and the fragment don't matter; the host must be one of ours exactly.
 */
export function resonanceCardKey(url: string, extraHosts: readonly string[] = ownHosts()): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.host.toLowerCase();
  if (!CARD_LINK_HOSTS.includes(host) && !extraHosts.includes(host)) return null;
  const m = parsed.pathname.match(CARD_PATH);
  if (!m) return null;
  let key: string;
  try {
    key = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return CARD_KEY.test(key) ? key : null;
}

/** The card a message shows as its rich bubble. */
export interface MessageCard {
  /** The card's slug or id, as GET /cards?keys= takes it. */
  key: string;
  /** `cardRef`: shared from the card picker; `link`: a link to a card page in the text (or its preview). */
  via: 'cardRef' | 'link';
  /** For `link`: the normalized address, which the generic preview falls back to when the card can't be shown. */
  url?: string;
  /**
   * For `link`: the message's text is that link and nothing else, so the bubble
   * leaves the text out and shows only the card.
   */
  linkOnly?: boolean;
}

/**
 * The card a message is about: its shared card, or else the Resonance card
 * its first link (the one the server previews) leads to. Null for a message
 * about no card.
 */
export function messageCard(message: Message, extraHosts?: readonly string[]): MessageCard | null {
  if (message.cardRef) return { key: message.cardRef, via: 'cardRef' };
  const first = findLinks(message.text)[0];
  const url = message.preview?.url ?? first?.url;
  if (!url) return null;
  const key = resonanceCardKey(url, extraHosts);
  if (!key) return null;
  const linkOnly = !!first && message.text.slice(0, first.start).trim() === '' && message.text.slice(first.end).trim() === '';
  return { key, via: 'link', url, linkOnly };
}

/** The cards a thread's messages are about, each once, in thread order. */
export function threadCardKeys(messages: readonly Message[], extraHosts: readonly string[] = ownHosts()): string[] {
  const keys = new Set<string>();
  for (const m of messages) {
    const card = messageCard(m, extraHosts);
    if (card) keys.add(card.key);
  }
  return [...keys];
}
