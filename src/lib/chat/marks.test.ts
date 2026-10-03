import { describe, it, expect } from 'vitest';
import { markedSegments } from './marks';

/** A bubble's words as it draws them: text and links, cut where a search matched. */
describe('markedSegments', () => {
  it('keeps words with no matches whole', () => {
    expect(markedSegments('早安')).toEqual([{ type: 'text', pieces: [{ text: '早安', marked: false }] }]);
  });

  it('marks every match, in order', () => {
    expect(markedSegments('咖啡和咖啡', [{ start: 3, end: 5 }, { start: 0, end: 2 }])).toEqual([
      {
        type: 'text',
        pieces: [
          { text: '咖啡', marked: true },
          { text: '和', marked: false },
          { text: '咖啡', marked: true },
        ],
      },
    ]);
  });

  it('marks a match inside a link, and one that runs across its edge', () => {
    const text = 'see https://example.com/coffee now';
    const segments = markedSegments(text, [{ start: 0, end: 3 }, { start: 24, end: 34 }]);
    expect(segments).toEqual([
      { type: 'text', pieces: [{ text: 'see', marked: true }, { text: ' ', marked: false }] },
      {
        type: 'link',
        url: 'https://example.com/coffee',
        host: 'example.com',
        suspicious: false,
        text: 'https://example.com/coffee',
        pieces: [
          { text: 'https://example.com/', marked: false },
          { text: 'coffee', marked: true },
        ],
      },
      { type: 'text', pieces: [{ text: ' now', marked: true }] },
    ]);
    // Put back together, the pieces are the words as written.
    expect(segments.flatMap((s) => s.pieces.map((p) => p.text)).join('')).toBe(text);
  });

  it('says which links are easy to mistake for another place', () => {
    const [, link] = markedSegments('try http://192.168.0.5/admin');
    expect(link).toMatchObject({ type: 'link', host: '192.168.0.5', suspicious: true });
  });
});
