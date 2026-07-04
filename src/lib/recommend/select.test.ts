import { describe, expect, it } from 'vitest';
import { buildSelectMessages, parseSelection } from './select';

describe('buildSelectMessages', () => {
  it('states the keep cap and asks for ordered picks with reasons', () => {
    const msgs = buildSelectMessages(['讀者體悟'], [{ ref: 'c1', coreInsight: '某體悟', situation: '某情境' }], 8);
    expect(msgs[0].content).toContain('up to 8');
    expect(msgs[0].content).toMatch(/picks/);
    expect(msgs[1].content).toContain('讀者體悟');
    expect(msgs[1].content).toContain('[c1]');
  });
});

describe('parseSelection', () => {
  it('parses picks preserving order', () => {
    const out = parseSelection({
      picks: [
        { ref: 'b', reason: '因為你也走過' },
        { ref: 'a', reason: '同樣的領悟' },
      ],
    });
    expect(out.map((p) => p.ref)).toEqual(['b', 'a']);
    expect(out[0].reason).toBe('因為你也走過');
  });

  it('skips entries without a ref and tolerates junk', () => {
    expect(parseSelection({ picks: [{ reason: 'no ref' }, { ref: 'x', reason: 'ok' }] })).toEqual([
      { ref: 'x', reason: 'ok' },
    ]);
    expect(parseSelection(null)).toEqual([]);
    expect(parseSelection({ nope: 1 })).toEqual([]);
  });
});
