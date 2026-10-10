import { findLinks, LINK_MAX_LENGTH } from '@/lib/links/url';
import { ENTITY, entityValue } from '@/lib/text/entities';

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
 * What the writer wrote as text and Markdown must not read as syntax: a
 * backslash-escaped ASCII punctuation mark (`\*`, `1\.`, `\#` — the editor
 * writes them) and a character reference (`&gt;` — the editor writes `<`,
 * `>` and `&` typed as text that way; `->` is stored `-&gt;`). Each such
 * mark stands in as a private-use character, U+E000 plus its ASCII code, one
 * UTF-16 unit for one, so offsets agree with the restored text, until the
 * syntax is gone (restore). Those private-use characters are never in a
 * story's prose otherwise: plainText drops any it is given.
 */
const LITERAL = 0xe000;
const LITERALS = /[\ue021-\ue07e]/g;
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;

function literal(char: string): string {
  return ASCII_PUNCTUATION.test(char) ? String.fromCharCode(LITERAL + char.charCodeAt(0)) : char;
}

function literals(markdown: string): string {
  const escapeOrEntity = new RegExp(`\\\\([!-/:-@[-\`{-~])|\\\\\\r?\\n|${ENTITY.source}`, 'gi');
  return markdown.replace(escapeOrEntity, (whole, escaped: string | undefined, body: string | undefined) => {
    if (escaped) return literal(escaped);
    // A backslash at a line's end is a hard break: a space, as any line break is here.
    if (!body) return ' ';
    const value = entityValue(body);
    return value == null ? whole : literal(value);
  });
}

/** The marks literals() set aside, back as the characters they are. */
function restore(text: string): string {
  return text.replace(LITERALS, (c) => String.fromCharCode(c.charCodeAt(0) - LITERAL));
}

/**
 * The text without its bare addresses: exactly the links the one link rule
 * finds (`findLinks`, lib/links/url — which already leaves the sentence's
 * punctuation, CJK too, and an unmatched `)` outside the link), each with the
 * `<…>` of an autolink around it. Everything else the writer wrote stays: the
 * words either side, the punctuation after the address (and no space is left
 * hanging before it), an address the rule doesn't accept (`foo@www.…`,
 * `localhost`). Marks set aside by literals() count as what they stand for.
 */
export function withoutLinks(text: string): string {
  const plain = restore(text);
  let out = '';
  let at = 0;
  for (const link of findLinks(plain)) {
    let { start, end } = link;
    if (plain[start - 1] === '<' && plain[end] === '>') {
      start--;
      end++;
    }
    const before = text.slice(at, start);
    // "see https://…, then" reads "see, then"; "see https://… then" keeps its space. trimEnd takes
    // exactly what `/\s+$/` would, without retrying every space of a long run inside `before` (quadratic).
    out += CLOSING.test(plain.slice(end, end + 2)) ? before.trimEnd() : before;
    at = end;
  }
  return out + text.slice(at);
}

/**
 * A picture, `![alt](src)`, and a link, `[text](destination)` (its text is
 * group 1), on one line. Every run is bounded — a link's text by
 * LINK_TEXT_MAX, its destination by the longest address the link rule takes —
 * so no attempt reads on to the story's end: unbounded, a story of 200 000
 * unclosed `[` (or `[a](` over and over) took 14 s to read, on the server at
 * publish and in every browser showing its excerpt. A link whose text runs
 * longer shows its brackets in an excerpt, which is harmless.
 */
const LINK_TEXT_MAX = 500;
const PICTURE = new RegExp(`!\\[[^\\]\\n]{0,${LINK_TEXT_MAX}}\\]\\([^)\\n]{0,${LINK_MAX_LENGTH}}\\)`, 'g');
const LINK = new RegExp(`\\[([^\\]\\n]{0,${LINK_TEXT_MAX}})\\]\\([^)\\n]{0,${LINK_MAX_LENGTH}}\\)`, 'g');
/** A picture with a web address, `![alt](https://…)` (the address is group 1), bounded as PICTURE is. */
const WEB_PICTURE = new RegExp(`!\\[[^\\]\\n]{0,${LINK_TEXT_MAX}}\\]\\((https?:\\/\\/[^\\s)]{1,${LINK_MAX_LENGTH}})\\)`);

/** The address of the story's first picture on the web — a thought-map node's little visual — or null. */
export function firstPicture(markdown: string): string | null {
  return WEB_PICTURE.exec(markdown)?.[1] ?? null;
}

/**
 * A story's prose without Markdown syntax (links keep their text), as a
 * reader sees it: character references decoded (`-&gt;` reads `->`) and
 * backslash escapes gone (`\*` reads `*`), without either ever making
 * syntax. A bare address is left out (withoutLinks): the story shows it as a
 * link or its page's card, and in an excerpt it is only a string of
 * characters taking the prose's place.
 */
export function plainText(markdown: string): string {
  const text = literals(markdown.replace(LITERALS, '').replace(/```[\s\S]*?```/g, ' '));
  return restore(
    withoutLinks(text.replace(PICTURE, ' ').replace(LINK, '$1'))
      // After the addresses go: an address's `_`, `~` and `*` are not emphasis.
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      // A marker's indent is spaces and tabs on its own line: `^\s*` would read on across every blank line after it, at each one (quadratic).
      .replace(/^[ \t]*(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
      .replace(/[*~`]+/g, '')
      // An underscore inside a word is the word's (snake_case, a_b_c): only one at a word's edge can be emphasis.
      .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
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
