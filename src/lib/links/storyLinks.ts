import { fromMarkdown } from 'mdast-util-from-markdown';
import { siteUrl } from '@/lib/site';
import { findLinks, normalizeLink } from './url';

/**
 * Which links in a story get a preview card: the paragraph-level twin of the
 * card-embed rule (`embeddedCardKeys`). A paragraph whose only meaningful
 * child is
 *
 *  (a) a link — `[text](url)`, `<url>` or a reference link whose definition
 *      exists — to an http(s) address the link rules take (`normalizeLink`),
 *      with no picture inside it; or
 *  (b) a run of plain text that is, once trimmed, exactly one link
 *      (`findLinks`) from its first character to its last,
 *
 * is a "standalone link", keyed by its normalized URL. Every other link stays
 * inline, as it always was. Paragraphs in quotes and list items count.
 *
 * The story is read as CommonMark without GFM — as the apps' parsers read it
 * (neither turns a bare URL into a link) — so a bare URL arrives as text and
 * `~~[t](url)~~` is three children, not one. The web reader, which renders
 * with GFM, does not re-derive the rule: it asks `soleLinkParagraphs` which
 * of its paragraphs (by where they start in the source) are standalone links
 * and under which key, so the two cannot disagree.
 *
 * Shared, case by case, with the apps through
 * native/fixtures/story-link-cards.json.
 */

/** At most this many links in one story get a preview (the first ones, in reading order). */
export const STORY_PREVIEW_LIMIT = 10;

/**
 * Our own hosts. A link to one of our pages is never unfurled — the server
 * would be asking itself, and a card already has its own embed (`/card/…`).
 */
export const SITE_HOSTS: readonly string[] = ['resonance.channel', 'www.resonance.channel', 'resonance-world.vercel.app'];

interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  identifier?: string;
  position?: { start: { offset?: number } };
}

const HTTP = /^https?:\/\//i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Whether the subtree holds a picture (`[![img](…)](url)` is a linked picture, not a link). */
function holdsImage(node: MdNode): boolean {
  return node.type === 'image' || node.type === 'imageReference' || (node.children ?? []).some(holdsImage);
}

/** The standalone link a paragraph is (see the rules above), as its normalized URL — or null. */
function soleLinkOf(paragraph: MdNode, definitions: Map<string, string>): string | null {
  const meaningful = (paragraph.children ?? []).filter((c) => !(c.type === 'text' && !String(c.value ?? '').trim()));
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  if (only.type === 'link' || only.type === 'linkReference') {
    const href = only.type === 'link' ? only.url : definitions.get(only.identifier ?? '');
    if (!href || !HTTP.test(href) || holdsImage(only)) return null;
    return normalizeLink(href);
  }
  if (only.type === 'text') {
    const text = String(only.value ?? '').trim();
    const found = findLinks(text);
    return found.length === 1 && found[0].start === 0 && found[0].end === text.length ? found[0].url : null;
  }
  return null;
}

/**
 * Every paragraph of the story that is a standalone link: where it starts in
 * the source (a UTF-16 offset, as the web's Markdown tree reports it) → its
 * key. Before the limits below: our own hosts and duplicates are still here.
 */
export function soleLinkParagraphs(story: string): Map<number, string> {
  const found = new Map<number, string>();
  if (!/https?:\/\/|www\./i.test(story)) return found;
  const root = fromMarkdown(story) as MdNode;
  const definitions = new Map<string, string>();
  const collect = (node: MdNode) => {
    // The first definition of a label wins, as CommonMark resolves it.
    if (node.type === 'definition' && node.identifier && node.url != null && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url);
    }
    node.children?.forEach(collect);
  };
  collect(root);
  const walk = (node: MdNode) => {
    if (node.type === 'paragraph') {
      const key = soleLinkOf(node, definitions);
      const offset = node.position?.start.offset;
      if (key && offset != null) found.set(offset, key);
      return;
    }
    node.children?.forEach(walk);
  };
  walk(root);
  return found;
}

/** Whether the server would ever fetch this address for a story: not our own site, not a bare IP address. */
export function unfurlable(url: string, siteHost: string | null = null): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/\.$/, '');
  } catch {
    return false;
  }
  if (SITE_HOSTS.includes(host) || (siteHost && host === siteHost)) return false;
  return !IPV4.test(host) && !host.startsWith('[');
}

/** The host `siteUrl()` names (localhost outside a deployment, which no link can name). */
function ownHost(): string | null {
  try {
    return new URL(siteUrl()).hostname;
  } catch {
    return null;
  }
}

/**
 * The links a story gets preview cards for: its standalone links (see above)
 * that are not our own pages or bare IP addresses, in reading order, each
 * once, at most `max`.
 */
export function standaloneLinks(story: string, max = STORY_PREVIEW_LIMIT): string[] {
  const host = ownHost();
  const links: string[] = [];
  for (const url of soleLinkParagraphs(story).values()) {
    if (links.length >= max) break;
    if (!links.includes(url) && unfurlable(url, host)) links.push(url);
  }
  return links;
}
