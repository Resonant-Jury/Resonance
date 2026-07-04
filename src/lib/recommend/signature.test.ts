import { describe, expect, it } from 'vitest';
import {
  INSIGHT_INDEX_THRESHOLD,
  isIndexable,
  parseSignature,
  signatureToChannelTexts,
} from './signature';

describe('parseSignature', () => {
  it('maps snake_case LLM output into the camelCase signature', () => {
    const sig = parseSignature({
      core_insight: '把自我價值綁在外在成果上，會在失敗時崩潰',
      intent: '想記錄這次轉念',
      situation: '創業專案失敗後的低潮',
      life_domain: '自我認同 / 職涯',
      emotional_register: '釋懷中帶著不甘',
      insight_score: 0.8,
    });
    expect(sig.coreInsight).toBe('把自我價值綁在外在成果上，會在失敗時崩潰');
    expect(sig.situation).toBe('創業專案失敗後的低潮');
    expect(sig.lifeDomain).toBe('自我認同 / 職涯');
    expect(sig.insightScore).toBe(0.8);
  });

  it('tolerates missing fields and trims whitespace', () => {
    const sig = parseSignature({ core_insight: '  a realization  ' });
    expect(sig.coreInsight).toBe('a realization');
    expect(sig.situation).toBe('');
    expect(sig.insightScore).toBe(0);
  });

  it('clamps out-of-range and non-numeric scores into 0–1', () => {
    expect(parseSignature({ insight_score: 5 }).insightScore).toBe(1);
    expect(parseSignature({ insight_score: -2 }).insightScore).toBe(0);
    expect(parseSignature({ insight_score: 'oops' }).insightScore).toBe(0);
  });

  it('returns an empty-but-valid signature for junk input', () => {
    expect(parseSignature(null).coreInsight).toBe('');
    expect(parseSignature('nonsense').insightScore).toBe(0);
  });
});

describe('isIndexable', () => {
  it('requires a core insight above the score threshold', () => {
    expect(isIndexable(parseSignature({ core_insight: 'x', insight_score: INSIGHT_INDEX_THRESHOLD }))).toBe(true);
    expect(isIndexable(parseSignature({ core_insight: 'x', insight_score: 0.1 }))).toBe(false);
    expect(isIndexable(parseSignature({ core_insight: '', insight_score: 0.9 }))).toBe(false);
  });
});

describe('signatureToChannelTexts', () => {
  it('emits insight (with life domain) and situation channels', () => {
    const texts = signatureToChannelTexts(
      parseSignature({
        core_insight: '愛情不該是我的全部',
        situation: '分手後的重整',
        life_domain: '關係',
        insight_score: 0.7,
      })
    );
    expect(texts).toEqual([
      { channel: 'insight', text: '愛情不該是我的全部（關係）' },
      { channel: 'situation', text: '分手後的重整' },
    ]);
  });

  it('omits channels with no content', () => {
    const texts = signatureToChannelTexts(parseSignature({ core_insight: 'only insight', insight_score: 0.7 }));
    expect(texts).toHaveLength(1);
    expect(texts[0].channel).toBe('insight');
  });
});
