import { describe, expect, it } from 'vitest';
import { summarize } from './summary';

// The list summary a server write stores beside a story (publish, edits/apply,
// card settings, scripts/backfill-card-summaries.ts): the excerpt and read
// time the native apps and web lists show. The read time's rule is
// lib/readTime's (readTime.test.ts); these are whole stories through it.

/** The rule before words were counted: every non-space character, at 320 a minute. */
const byCharacters = (text: string) => Math.max(1, Math.round(text.replace(/\s+/g, '').length / 320));

const ZH = '那天傍晚，雨終於停了。我沿著河堤慢慢走，路燈一盞一盞亮起來，水面浮著碎碎的光。「你還記得嗎？」她忽然問——我沒有回答……只是點點頭。';
const EN = 'The rain stopped just before dusk, and the street outside the bakery shone like a river of glass.';

describe('summarize', () => {
  it('times a Chinese story by the character, as it always has', () => {
    // A heading and 24 quoted paragraphs: 1612 characters, Markdown marks included.
    const story = `## 雨後\n\n${Array(24).fill(`> ${ZH}`).join('\n\n')}`;
    expect(summarize(story).readMinutes).toBe(5);
    expect(byCharacters(story)).toBe(5);
  });

  it('times an English story by the word: 180 words is a minute, where its letters made 3', () => {
    const story = `## After the rain\n\n${Array(5).fill(`${EN} ${EN}`).join('\n\n')}`;
    expect(summarize(story).readMinutes).toBe(1);
    expect(byCharacters(story)).toBe(3);
    expect(summarize(Array(30).fill(EN).join('\n\n')).readMinutes).toBe(2); // 540 words: 2.3
  });

  it('times a mixed story by both, added up', () => {
    // 463 characters of Chinese (1.45 minutes) and a quoted English passage of 180 words (0.78).
    const story = `${Array(7).fill(ZH).join('\n\n')}\n\n> ${Array(10).fill(EN).join(' ')}`;
    expect(summarize(story).readMinutes).toBe(2);
    expect(byCharacters(story)).toBe(4);
  });

  // A standalone link shows as its page's card in the story, an inline one as a link: in a list's excerpt an
  // address is only characters in the prose's place.
  it('leaves bare addresses out of the excerpt, keeping a link\'s words and the sentence\'s punctuation', () => {
    const story = [
      '收藏了很久的幾個網頁，終於回到熟悉的地方。',
      '',
      'https://en.wikipedia.org/wiki/Jiufen_(town)',
      '',
      '這篇寫的是九份：<https://www.taipei-101.com.tw/tw/> 還有 www.example.com/a_b~c。',
      '',
      '> https://developer.mozilla.org/en-US/docs/Web/HTML',
      '',
      'I [walked slowly](https://example.com/walk) — see https://example.com/x, then home (or www.example.org).',
    ].join('\n');
    expect(summarize(story).excerpt).toBe(
      '收藏了很久的幾個網頁，終於回到熟悉的地方。 這篇寫的是九份： 還有。 I walked slowly — see, then home (or).',
    );
  });

  it('reads a missing or malformed story as empty, a minute long', () => {
    expect(summarize(undefined)).toEqual({ excerpt: '', readMinutes: 1 });
    expect(summarize({ text: 'x' })).toEqual({ excerpt: '', readMinutes: 1 });
  });
});
