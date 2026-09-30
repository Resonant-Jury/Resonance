import { fromMarkdown } from 'mdast-util-from-markdown';

/** How many embedded cards one card page brings along (a story rarely holds more than a few). */
export const EMBED_LIMIT = 30;

/** A card's URL segment as the contract names it (schemas.ts CardKey). */
const KEY = /^[A-Za-z0-9_-]{1,160}$/;

interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  identifier?: string;
}

/**
 * The card a `/card/…` link names (its slug or id), or null — the web's
 * cardKeyFromHref, limited to what can be a card key at all.
 */
export function cardKeyOfHref(href: string): string | null {
  const m = href.match(/^\/card\/([^/?#]+)/);
  if (!m) return null;
  let key = m[1];
  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }
  return KEY.test(key) ? key : null;
}

/**
 * The cards a story embeds, in reading order, each once (at most `max`): a
 * card link standing alone in its paragraph — the reader's rule
 * (StoryMarkdown's `p`, the apps' StoryParser) and the editor's (CardEmbed).
 * A card link inside a sentence stays a link and is not listed. Paragraphs
 * in quotes and list items count too (a superset of what the web draws is
 * harmless: the list only saves the reader a request per embed).
 */
export function embeddedCardKeys(story: string, max = EMBED_LIMIT): string[] {
  if (!story.includes('/card/')) return [];
  const root = fromMarkdown(story) as MdNode;
  const definitions = new Map<string, string>();
  const collect = (node: MdNode) => {
    if (node.type === 'definition' && node.identifier && node.url != null) definitions.set(node.identifier, node.url);
    node.children?.forEach(collect);
  };
  collect(root);

  const keys: string[] = [];
  const walk = (node: MdNode) => {
    if (keys.length >= max) return;
    if (node.type === 'paragraph') {
      const meaningful = (node.children ?? []).filter((c) => !(c.type === 'text' && !String(c.value ?? '').trim()));
      const only = meaningful.length === 1 ? meaningful[0] : null;
      const href = only?.type === 'link' ? only.url : only?.type === 'linkReference' ? definitions.get(only.identifier ?? '') : undefined;
      const key = href ? cardKeyOfHref(href) : null;
      if (key && !keys.includes(key)) keys.push(key);
      return;
    }
    node.children?.forEach(walk);
  };
  walk(root);
  return keys;
}
