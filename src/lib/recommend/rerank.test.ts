import { describe, expect, it } from 'vitest';
import { buildRerankMessages, parseRerankScores } from './rerank';

describe('buildRerankMessages', () => {
  it('embeds reader summaries and numbered candidates, asks for JSON scores', () => {
    const msgs = buildRerankMessages(
      ['把自我價值綁在成果上'],
      [
        { ref: '0', coreInsight: '愛情不該是全部', situation: '分手' },
        { ref: '1', coreInsight: '允許自己失敗', situation: '' },
      ]
    );
    expect(msgs[0].content).toMatch(/JSON/);
    expect(msgs[1].content).toContain('把自我價值綁在成果上');
    expect(msgs[1].content).toContain('[0]');
    expect(msgs[1].content).toContain('情境：分手');
    // No situation for ref 1 → no 情境 segment appended.
    expect(msgs[1].content).toContain('[1] 體悟：允許自己失敗');
  });

  it('handles a reader with no prior insights', () => {
    const msgs = buildRerankMessages([], [{ ref: '0', coreInsight: 'x', situation: '' }]);
    expect(msgs[1].content).toContain('暫無');
  });
});

describe('parseRerankScores', () => {
  it('parses the {scores:[...]} shape and clamps to 0..1', () => {
    const out = parseRerankScores({ scores: [{ ref: 'a', score: 0.8 }, { ref: 'b', score: 2 }] });
    expect(out).toEqual({ a: 0.8, b: 1 });
  });

  it('parses the bare {ref:score} fallback shape', () => {
    expect(parseRerankScores({ a: 0.3, b: 0.9 })).toEqual({ a: 0.3, b: 0.9 });
  });

  it('drops malformed entries without throwing', () => {
    const out = parseRerankScores({ scores: [{ ref: 'a', score: 'oops' }, { score: 0.5 }, { ref: 'c', score: 0.4 }] });
    expect(out).toEqual({ c: 0.4 });
  });

  it('returns an empty map for junk input', () => {
    expect(parseRerankScores(null)).toEqual({});
    expect(parseRerankScores('nope')).toEqual({});
  });
});
