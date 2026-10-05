import { findLinks } from '@/lib/links/url';

/**
 * A story's prose as lists and previews show it — the excerpt the server
 * stores beside a card (lib/api/v1/summary), the web's story cards, the
 * thought map's nodes, a shared card in a thread and the og:description —
 * one set of rules on the server and in the browser.
 */

/** How much of the prose a list's excerpt shows (StoryCard on the web; the apps' list rows). */
export const EXCERPT_CHARS = 96;

/** Closing marks — sentence punctuation, closing brackets and quotes, CJK ones too: the sentence's, never the link's. */
const CLOSING = /^[\p{Po}\p{Pe}\p{Pf}]/u;

/**
 * The text without its bare addresses: exactly the links the one link rule
 * finds (`findLinks`, lib/links/url — which already leaves the sentence's
 * punctuation, CJK too, and an unmatched `)` outside the link), each with the
 * `<…>` of an autolink around it. Everything else the writer wrote stays: the
 * words either side, the punctuation after the address (and no space is left
 * hanging before it), an address the rule doesn't accept (`foo@www.…`,
 * `localhost`).
 */
export function withoutLinks(text: string): string {
  let out = '';
  let at = 0;
  for (const link of findLinks(text)) {
    let { start, end } = link;
    if (text[start - 1] === '<' && text[end] === '>') {
      start--;
      end++;
    }
    const before = text.slice(at, start);
    // "see https://…, then" reads "see, then"; "see https://… then" keeps its space.
    out += CLOSING.test(text.slice(end, end + 2)) ? before.replace(/\s+$/, '') : before;
    at = end;
  }
  return out + text.slice(at);
}

/**
 * A story's prose without Markdown syntax (links keep their text). A bare
 * address is left out (withoutLinks): the story shows it as a link or its
 * page's card, and in an excerpt it is only a string of characters taking the
 * prose's place.
 */
export function plainText(markdown: string): string {
  return withoutLinks(
    markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
  )
    // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first `max` characters, cut between code points: slicing UTF-16 units
 * can leave half an emoji, a lone surrogate that Swift's JSONDecoder rejects —
 * failing the whole page.
 */
export function excerpt(text: string, max = EXCERPT_CHARS): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}
