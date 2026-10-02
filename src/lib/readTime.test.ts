import { describe, expect, it } from 'vitest';
import { readMinutes } from './readTime';

// The read time lists show beside a card (lib/api/v1/summary stores it,
// lib/adapters/story falls back to it): CJK by the character, the rest by the
// word, added up.

/** The rule before words were counted: every non-space character, at 320 a minute. */
const byCharacters = (text: string) => Math.max(1, Math.round(text.replace(/\s+/g, '').length / 320));

const ZH =
  '那天傍晚，雨終於停了。我沿著河堤慢慢走，路燈一盞一盞亮起來，水面浮著碎碎的光。「你還記得嗎？」她忽然問——我沒有回答……只是點點頭。後來我們在橋邊坐了很久；風把那首“城南的歌”吹得斷斷續續，像《舊事》裡寫的那樣：有些話，說出口就散了。';
const JA =
  'その日の夕方、雨はやっと上がった。川沿いをゆっくり歩くと、街灯がひとつずつ灯り、コーヒーの香りが漂ってきた。「覚えてる？」と彼女は聞いた——私は黙って頷いた……。';
const KO = '그날 저녁, 비가 마침내 그쳤다. 나는 강둑을 따라 천천히 걸었고, 가로등이 하나씩 켜졌다. "기억나?" 그녀가 물었다—나는 대답하지 않았다…';
const EN = 'The rain stopped just before dusk, and the street outside the bakery shone like a river of glass.';

/** The first n characters of Chinese prose: it has no spaces, so each one is read. */
const zh = (n: number) => ZH.repeat(Math.ceil(n / ZH.length)).slice(0, n);
/** n words of English prose. */
const en = (n: number) => {
  const words = EN.split(' ');
  return Array.from({ length: n }, (_, i) => words[i % words.length]).join(' ');
};

/** A Markdown story of the given paragraphs, the way the editor writes one. */
const story = (paragraph: string) =>
  Array.from({ length: 6 }, () => `## ${paragraph.slice(0, 4)}\n\n${paragraph}\n\n**${paragraph}**\n\n> ${paragraph}\n\n- ${paragraph}`).join('\n\n');

/** Every prefix of `text` whose read time differs from the old rule's (none, for text without words). */
const departures = (text: string) =>
  Array.from({ length: text.length + 1 }, (_, n) => text.slice(0, n)).filter((s) => readMinutes(s) !== byCharacters(s)).length;

describe('readMinutes', () => {
  it('times Chinese exactly as before: every character, punctuation and Markdown marks included, at 320 a minute', () => {
    expect(readMinutes(zh(320))).toBe(1);
    expect(readMinutes(zh(479))).toBe(1);
    expect(readMinutes(zh(480))).toBe(2);
    expect(readMinutes(zh(1600))).toBe(5);
    // Every prefix of a nine-minute story, so across each minute's rounding.
    expect(readMinutes(story(ZH))).toBe(9);
    expect(departures(story(ZH))).toBe(0);
  });

  it('times Japanese and Korean by the character too, as before', () => {
    expect(departures(story(JA))).toBe(0);
    expect(departures(story(KO))).toBe(0);
  });

  it('times English by the word, at 230 a minute: ~180 words is a minute, not the 3 its letters made', () => {
    expect(byCharacters(en(180))).toBe(3);
    expect(readMinutes(en(180))).toBe(1);
    expect(readMinutes(en(344))).toBe(1);
    expect(readMinutes(en(345))).toBe(2);
    expect(readMinutes(en(1150))).toBe(5);
    // Six sections of a heading word and four 60-word paragraphs (1446 words), and their 24 marks (##, >, -): 6.36.
    expect(readMinutes(story(en(60)))).toBe(6);
  });

  it.each(["don't", 'well-known', '3.14', '“quoted,”', '**rain**', '[link](https://example.com/a/long/path.avif)'])(
    'reads %s as one word',
    (word) => {
      // A second word, or its letters counted as characters, would show at each of these lengths.
      for (const n of [345, 575, 805]) expect(readMinutes(Array(n).fill(word).join(' '))).toBe(Math.round(n / 230));
    },
  );

  it('adds the two up when a story mixes them', () => {
    // 1.5 minutes of Chinese and half a minute of English.
    const mixed = `${zh(480)}\n\n${en(115)}`;
    expect(readMinutes(mixed)).toBe(2);
    expect(byCharacters(mixed)).toBe(3);
    expect(readMinutes(`${zh(160)} ${en(115)}`)).toBe(1);
    // English set in unspaced Chinese is still words: 4 characters and a word, 115 times over (1.44 + 0.5).
    expect(readMinutes('我用iPhone拍照'.repeat(115))).toBe(2);
  });

  it('is never less than a minute', () => {
    for (const text of ['', ' \n\t　', 'Hi.', '好。', '——']) expect(readMinutes(text)).toBe(1);
  });
});
