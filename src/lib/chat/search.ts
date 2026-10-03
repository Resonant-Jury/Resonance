import type { Message } from '@/lib/db/types';

/** A stretch of text: UTF-16 offsets, `end` exclusive (as `slice` takes them). */
export interface TextRange {
  start: number;
  end: number;
}

/** Where a search matched: the message and the stretches of its text that match, in order. */
export interface SearchHit {
  messageId: string;
  ranges: TextRange[];
}

/**
 * One character in, one out (so offsets stay put): lower case, full-width
 * ASCII to plain (a CJK keyboard types `ＡＢＣ１２３`), an ideographic space to
 * a plain one. A character whose lower case is longer than itself stays as it
 * is.
 */
export function foldForSearch(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    let c = text[i];
    if (code >= 0xff01 && code <= 0xff5e) c = String.fromCharCode(code - 0xfee0);
    else if (code === 0x3000) c = ' ';
    const lower = c.toLowerCase();
    out += lower.length === 1 ? lower : c;
  }
  return out;
}

/** Every non-overlapping match of the (folded) `needle` in the (folded) `haystack`. */
function rangesOf(haystack: string, needle: string): TextRange[] {
  const out: TextRange[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return out;
    out.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
}

/**
 * Searches a conversation's messages the way a person types the query — the
 * twin of the apps' MessageSearch: case doesn't matter, and neither does the
 * width of ASCII letters and digits nor an ideographic space for a plain one.
 * The whole query is one phrase; a query that is only spaces matches nothing.
 * The hits come newest first (`messages` are oldest first, as held); their
 * ranges are offsets into each message's text as written.
 */
export function searchMessages(messages: readonly Message[], query: string): SearchHit[] {
  const needle = foldForSearch(query.trim());
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.text) continue;
    const ranges = rangesOf(foldForSearch(m.text), needle);
    if (ranges.length) hits.push({ messageId: m.id, ranges });
  }
  return hits;
}

/** The line a search result shows for a message, with its matches. */
export interface SearchSnippet {
  text: string;
  ranges: TextRange[];
}

/** How much of a message a result shows at most (two short lines). */
export const SNIPPET_MAX = 96;
/** How much of the text before the first match is kept, so the match isn't pushed off the first line. */
const SNIPPET_LEAD = 14;

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * A message's text cut around the first of its matches — the twin of the
 * apps' SearchSnippet: a stretch with the first match near the front, `…`
 * where the message goes on, its line breaks flattened to spaces, and the
 * matches that fall inside it (offsets into the snippet).
 */
export function searchSnippet(text: string, ranges: readonly TextRange[], max = SNIPPET_MAX): SearchSnippet {
  const flat = text.replace(/[\r\n]/g, ' ');
  if (flat.length <= max) return { text: flat, ranges: [...ranges] };
  if (!ranges.length) {
    let end = max;
    if (isHigh(flat.charCodeAt(end - 1))) end--;
    return { text: `${flat.slice(0, end)}…`, ranges: [] };
  }
  const first = ranges[0];
  let from = Math.max(0, first.start - SNIPPET_LEAD);
  // Never open on the second half of a surrogate pair.
  if (from > 0 && isLow(flat.charCodeAt(from))) from--;
  let to = Math.min(flat.length, from + max);
  // A match longer than the window still shows its beginning in full.
  if (to <= first.start) to = Math.min(flat.length, first.start + 1);
  if (to < flat.length && isHigh(flat.charCodeAt(to - 1))) to--;
  const head = from > 0 ? '…' : '';
  const tail = to < flat.length ? '…' : '';
  const shifted: TextRange[] = [];
  for (const r of ranges) {
    const start = Math.max(r.start, from);
    const end = Math.min(r.end, to);
    if (end > start) shifted.push({ start: start - from + head.length, end: end - from + head.length });
  }
  return { text: head + flat.slice(from, to) + tail, ranges: shifted };
}
