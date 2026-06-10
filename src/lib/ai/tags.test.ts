import { describe, expect, it } from 'vitest';
import { parseTagList, topTags } from './tags';

describe('parseTagList', () => {
  it('parses one-tag-per-line replies (the prompted format)', () => {
    expect(parseTagList('家庭\n記憶\n和解')).toEqual(['家庭', '記憶', '和解']);
  });

  it('strips bullets, numbering, hashes and quotes', () => {
    expect(parseTagList('- #家庭\n2) 「記憶」\n* 和解')).toEqual(['家庭', '記憶', '和解']);
  });

  it('accepts comma / 、 separated replies', () => {
    expect(parseTagList('家庭、記憶, 和解')).toEqual(['家庭', '記憶', '和解']);
  });

  it('accepts a JSON array reply, even inside a code fence', () => {
    expect(parseTagList('```json\n["家庭", "記憶"]\n```')).toEqual(['家庭', '記憶']);
  });

  it('dedupes, drops empties and over-long entries, and caps at max', () => {
    const raw = ['a', 'a', '', 'x'.repeat(30), 'b', 'c', 'd', 'e', 'f'].join('\n');
    expect(parseTagList(raw, 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('topTags', () => {
  it('ranks by frequency across cards', () => {
    const lists = [
      ['家庭', '記憶'],
      ['家庭', '夜晚'],
      ['家庭', '記憶'],
    ];
    expect(topTags(lists)).toEqual(['家庭', '記憶', '夜晚']);
  });

  it('keeps first-seen order among equal counts and applies the limit', () => {
    const lists = [['b', 'a'], ['c']];
    expect(topTags(lists, 2)).toEqual(['b', 'a']);
  });

  it('ignores blank entries and trims whitespace', () => {
    expect(topTags([['  家庭 ', '', '  ']])).toEqual(['家庭']);
  });
});
