import { describe, expect, it } from 'vitest';
import { excerpt, plainText, withoutLinks } from './plainText';

// The prose lists and previews show of a story, on the server (the stored list
// excerpt) and in the browser (story cards, thought-map nodes, a shared card,
// og:description). A bare address goes by the one link rule (lib/links/url,
// findLinks): what it reads as a link is left out, nothing else is.

describe('withoutLinks', () => {
  it('keeps the words and the CJK punctuation after an address, with no space left before the punctuation', () => {
    expect(withoutLinks('我很喜歡 https://example.com，因為它很好。')).toBe('我很喜歡，因為它很好。');
    expect(withoutLinks('他說「https://example.com/x」很好')).toBe('他說「」很好');
    expect(withoutLinks('see https://example.com/x, then home (or www.example.org).')).toBe('see, then home (or).');
    expect(withoutLinks('看看https://example.com很棒')).toBe('看看很棒');
  });

  it('leaves alone what the link rule does not read as a link', () => {
    expect(withoutLinks('寫信到 foo@www.example.com 就好')).toBe('寫信到 foo@www.example.com 就好');
    expect(withoutLinks('local http://localhost:3000/x and xhttps://example.com')).toBe(
      'local http://localhost:3000/x and xhttps://example.com',
    );
  });

  it("takes an autolink's angle brackets with it, and a link's own balanced parentheses", () => {
    expect(withoutLinks('九份：<https://www.taipei-101.com.tw/tw/> 還有')).toBe('九份： 還有');
    expect(withoutLinks('a <https://example.com b')).toBe('a < b');
    expect(withoutLinks('(see https://en.wikipedia.org/wiki/Jiufen_(town))')).toBe('(see)');
  });
});

describe('plainText', () => {
  it('strips Markdown down to prose and leaves the addresses out before the emphasis marks go', () => {
    const md = [
      '# Title',
      '',
      '> a quote https://developer.mozilla.org/en-US/docs/Web/HTML',
      '',
      '- https://example.com/a_b~c*d',
      '- Some **bold** and _light_ text with a [link](https://x.y) and ![img](https://x.y/i.png).',
      '',
      '```js',
      'code("https://example.com");',
      '```',
    ].join('\n');
    expect(plainText(md)).toBe('Title a quote Some bold and light text with a link and .');
  });
});

describe('excerpt', () => {
  it('cuts between code points, never inside an emoji', () => {
    expect(excerpt(`${'a'.repeat(95)}😀b`)).toBe(`${'a'.repeat(95)}😀…`);
    expect(excerpt('short')).toBe('short');
  });
});
