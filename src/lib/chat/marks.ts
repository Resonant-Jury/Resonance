import { linkify } from '@/lib/links/linkify';
import type { TextRange } from './search';

/** A stretch of a segment's words: `marked` when a search matched it. */
export interface MarkedPiece {
  text: string;
  marked: boolean;
}

/** A message's words as a bubble draws them: plain text and links (see linkify), each cut where search matches begin and end. */
export type MarkedSegment =
  | { type: 'text'; pieces: MarkedPiece[] }
  | { type: 'link'; url: string; host: string; suspicious: boolean; text: string; pieces: MarkedPiece[] };

/** The part of [from, from + text.length) the ranges cover, as pieces of `text`. */
function piecesOf(text: string, from: number, ranges: readonly TextRange[]): MarkedPiece[] {
  const to = from + text.length;
  const out: MarkedPiece[] = [];
  let at = from;
  for (const r of ranges) {
    const start = Math.max(r.start, from);
    const end = Math.min(r.end, to);
    if (end <= start || end <= at) continue;
    if (start > at) out.push({ text: text.slice(at - from, start - from), marked: false });
    out.push({ text: text.slice(Math.max(start, at) - from, end - from), marked: true });
    at = end;
  }
  if (at < to) out.push({ text: text.slice(at - from), marked: false });
  return out;
}

/**
 * Splits a message's words into text and links (by the server's link rules)
 * and marks the stretches a search matched (`ranges`, offsets into `text`,
 * in order) — across a link's edge as much as inside plain text.
 */
export function markedSegments(text: string, ranges: readonly TextRange[] = []): MarkedSegment[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let offset = 0;
  return linkify(text).map((seg) => {
    const pieces = piecesOf(seg.text, offset, sorted);
    offset += seg.text.length;
    return seg.type === 'text'
      ? { type: 'text', pieces }
      : { type: 'link', url: seg.url, host: seg.host, suspicious: seg.suspicious, text: seg.text, pieces };
  });
}
