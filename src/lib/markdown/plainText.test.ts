import { describe, expect, it } from 'vitest';
import { excerpt, firstPicture, plainText, withoutLinks } from './plainText';

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
    expect(plainText('__bold__ and snake_case_name, _light_')).toBe('bold and snake_case_name, light');
  });
  it('reads character references and backslash escapes as the text they stand for, never as syntax', () => {
    // What the editor stores for text typed with <, >, & and Markdown's marks (native/fixtures/markdown-corpus.json).
    expect(plainText('A -&gt; B &amp; C &lt;3')).toBe('A -> B & C <3');
    expect(plainText('&lt;b&gt;不是 HTML&lt;/b&gt;')).toBe('<b>不是 HTML</b>');
    expect(plainText('\\*不是粗體\\*，1\\. 不是清單，\\# 不是標題，a_b_c。')).toBe('*不是粗體*，1. 不是清單，# 不是標題，a_b_c。');
    expect(plainText('\\# 開頭不是標題\n\n1\\. 開頭不是清單\n\n\\- 開頭不是項目\n\n&gt; 開頭不是引用')).toBe(
      '# 開頭不是標題 1. 開頭不是清單 - 開頭不是項目 > 開頭不是引用',
    );
    // Decoded once, numeric ones too; an escaped & starts no reference; a name it doesn't know stays as written.
    expect(plainText('&amp;gt; &#42;star&#x2A; &#x1F600; \\&amp; &unknown;')).toBe('&gt; *star* 😀 &amp; &unknown;');
    // A hard break is a space; an escaped bracket makes no link; a reference in a link's text is read too.
    expect(plainText('第一行\\\n第二行 \\[not a link\\](x) [Tom &amp; Jerry](https://example.com)')).toBe(
      '第一行 第二行 [not a link](x) Tom & Jerry',
    );
  });

  it('still leaves out an address whose text holds a reference, and its autolink brackets', () => {
    expect(plainText('see https://example.com/?a=1&amp;b=2, then &lt;https://example.org&gt; done')).toBe('see, then done');
  });

  it('reads any story the rules take in well under a second: no run of brackets or blank lines is read again from each place in it', () => {
    // Each took seconds to minutes before (a quadratic pattern), on the server at publish and in every browser showing the excerpt.
    const floods = ['[', '![', '[a](', '[](', '\n', ' \n', '-\n', '\t\n\n'].map((unit) => unit.repeat(Math.floor(200_000 / unit.length)));
    for (const story of floods) {
      const started = performance.now();
      plainText(story);
      expect(performance.now() - started, JSON.stringify(story.slice(0, 4))).toBeLessThan(1_000);
    }
    // Links, pictures, list markers and rules on their own lines read as before.
    expect(plainText('a [link](https://x.y "title") b ![pic](https://x.y/p.png) c')).toBe('a link b c');
    expect(plainText('\n\n  - one\n\t* two\n\n   1. three\n\n  ---  \n\nend')).toBe('one two three end');
  });

});

describe('firstPicture', () => {
  it("is the address of the story's first picture on the web, and quick to say there is none", () => {
    expect(firstPicture('text ![rain](https://cdn.example.com/a.avif) and ![b](https://x.y/b.png)')).toBe('https://cdn.example.com/a.avif');
    expect(firstPicture('[a link](https://x.y) ![local](/p.png) ![](ftp://x.y/p.png)')).toBeNull();
    const started = performance.now();
    expect(firstPicture('!['.repeat(100_000))).toBeNull();
    expect(firstPicture('![a](https://'.repeat(15_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('excerpt', () => {
  it('cuts between code points, never inside an emoji', () => {
    expect(excerpt(`${'a'.repeat(95)}😀b`)).toBe(`${'a'.repeat(95)}😀…`);
    expect(excerpt('short')).toBe('short');
  });
});
