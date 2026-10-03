import { describe, it, expect } from 'vitest';
import type { Message } from '@/lib/db/types';
import { foldForSearch, searchMessages, searchSnippet } from './search';

const msg = (id: string, text: string): Message => ({ id, senderId: 'alice', text, sentAt: new Date(0) });
const marked = (snippet: { text: string; ranges: { start: number; end: number }[] }) =>
  snippet.ranges.map((r) => snippet.text.slice(r.start, r.end));

describe('searchMessages', () => {
  it('finds the query case-insensitively, newest message first, with every match', () => {
    const hits = searchMessages([msg('a', 'Coffee at noon?'), msg('b', 'no'), msg('c', 'coffee, then more COFFEE')], 'coffee');
    expect(hits.map((h) => h.messageId)).toEqual(['c', 'a']);
    expect(hits[0].ranges).toEqual([
      { start: 0, end: 6 },
      { start: 18, end: 24 },
    ]);
  });

  it('matches full-width letters and digits and an ideographic space as their plain twins, in either direction', () => {
    expect(searchMessages([msg('a', '房間號碼ＡＢ１２')], 'ab12')[0].ranges).toEqual([{ start: 4, end: 8 }]);
    expect(searchMessages([msg('a', 'room ab12')], 'ＡＢ１２')[0].ranges).toEqual([{ start: 5, end: 9 }]);
    expect(searchMessages([msg('a', '明天　見')], '明天 見')).toHaveLength(1);
  });

  it('keeps offsets into the text as written', () => {
    expect(foldForSearch('ＡbＣ　')).toBe('abc ');
    expect(foldForSearch('İx')).toHaveLength(2);
  });

  it('matches nothing for a blank query or a card without words', () => {
    expect(searchMessages([msg('a', 'hello')], '   ')).toEqual([]);
    expect(searchMessages([msg('a', '')], 'a')).toEqual([]);
  });
});

describe('searchSnippet', () => {
  it('shows a short message whole, on one line', () => {
    const s = searchSnippet('see you\nat the café', [{ start: 15, end: 19 }]);
    expect(s.text).toBe('see you at the café');
    expect(marked(s)).toEqual(['café']);
  });

  it('cuts a long message around its first match, with an ellipsis where it goes on', () => {
    const text = `${'a'.repeat(100)} the match is here ${'b'.repeat(100)}`;
    const start = text.indexOf('match');
    const s = searchSnippet(text, [{ start, end: start + 5 }]);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(98);
    expect(marked(s)).toEqual(['match']);
    // The match sits near the front.
    expect(s.ranges[0].start).toBeLessThan(20);
  });

  it('never cuts an emoji in half', () => {
    const text = `${'😀'.repeat(60)}x`;
    const s = searchSnippet(text, [{ start: 120, end: 121 }]);
    expect(s.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(s.text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(marked(s)).toEqual(['x']);
  });

  it('keeps only the matches inside the window, clipped to it', () => {
    const text = `x${'a'.repeat(200)}x`;
    const s = searchSnippet(text, [
      { start: 0, end: 1 },
      { start: 201, end: 202 },
    ]);
    expect(marked(s)).toEqual(['x']);
  });
});
