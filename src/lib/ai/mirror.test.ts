import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptInsight, DRAFT_READ_CHARS, draftScript, draftUnits, MIN_DRAFT_UNITS } from './mirror';

// The publish panel's mirror moment: the draft's language, enough to read, and
// what of the model's answer is a line worth showing. The model is mocked
// (`./openai`); the route is route.test.ts beside it.

const chatJSON = vi.fn();
vi.mock('./openai', () => ({
  chat: vi.fn(),
  chatJSON: (...a: unknown[]) => chatJSON(...a),
  generateImage: vi.fn(),
  generateImageStream: vi.fn(),
}));
const { mirrorInsight } = await import('./tasks');

const ZH_TITLE = '搬出去的第一個早晨';
const ZH = '水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。我站在小小的廚房裡，等著咖啡滴完，想起以前總是匆匆出門。';
const EN_TITLE = 'The first morning on my own';
const EN = 'The water was too hot and the grind too fine, but it was the first morning that felt like mine. I stood in the tiny kitchen waiting for the coffee to drip, and thought about how I used to rush out the door.';

beforeEach(() => chatJSON.mockReset());

describe('draftScript', () => {
  it('reads the language a reader reads most of: a CJK character against a word', () => {
    expect(draftScript(ZH_TITLE, ZH)).toBe('han');
    expect(draftScript(EN_TITLE, EN)).toBe('latin');
    // An English story with a Chinese name in it is still English; a Chinese one quoting English is Chinese.
    expect(draftScript('Grandma', `${EN} 阿嬤 said nothing.`)).toBe('latin');
    expect(draftScript('外婆', `${ZH}她說 "take care" 就走了。`)).toBe('han');
    expect(draftScript('朝', 'はじめての朝、コーヒーを淹れた。自分だけの時間だと思った。')).toBe('kana');
    expect(draftScript('아침', '처음으로 혼자 맞는 아침이었다. 커피를 내리며 생각했다.')).toBe('hangul');
    expect(draftScript('', '')).toBe('other');
  });

  it("reads the draft's start only: its language there, and quickly whatever follows", () => {
    // Chinese for its first DRAFT_READ_CHARS characters, then far more English: the model reads the start, and so is the language judged.
    const zh = ZH.repeat(Math.ceil(DRAFT_READ_CHARS / ZH.length) + 1);
    expect(draftScript(ZH_TITLE, `${zh}${EN.repeat(200)}`)).toBe('han');
    expect(draftUnits('', `${'x'.repeat(DRAFT_READ_CHARS)} ${EN}`)).toBe(1);
    const started = performance.now();
    expect(draftUnits('', '['.repeat(1_000_000))).toBe(0);
    expect(draftScript('', '[a]('.repeat(250_000))).toBe('latin');
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('reads the prose, not the Markdown, the addresses or the entities around it', () => {
    expect(draftScript('', `https://example.com/a-very-long-english-address-with-many-words\n\n${ZH}`)).toBe('han');
    expect(draftUnits('', '**一** -&gt; https://example.com/x')).toBe(1);
  });
});

describe('acceptInsight', () => {
  it('keeps a line in the draft\'s language, without the quotes the panel adds or one closing full stop', () => {
    expect(acceptInsight('「早晨終於屬於自己了。」', 'han')).toBe('早晨終於屬於自己了');
    expect(acceptInsight('"A morning can be yours before anything else is."', 'latin')).toBe('A morning can be yours before anything else is');
    expect(acceptInsight('Was I ever really in a hurry?', 'latin')).toBe('Was I ever really in a hurry?');
    expect(acceptInsight('I need rest too, and that is allowed', 'latin')).toBe('I need rest too, and that is allowed');
  });

  it('says nothing for an answer in the wrong language: an English draft answered in Chinese, and the other way', () => {
    expect(acceptInsight('獨立的第一步，是允許自己慢下來', 'latin')).toBeNull();
    expect(acceptInsight('The first step of independence is slowing down', 'han')).toBeNull();
  });

  it('says nothing for commentary about the draft instead of a reflection of it', () => {
    for (const meta of [
      'I need the actual story details to distill an insight.',
      'Please provide more context about what happened.',
      'There is not enough information to identify a realization.',
      "I can't extract a clear insight from this.",
      'The draft is too short to reflect on',
      'No clear insight yet',
      '請提供更多細節，我才能幫你提煉',
      '這段文字內容太少，無法判斷核心領悟',
      '需要更多的故事內容',
    ]) {
      expect(acceptInsight(meta, /[一-龥]/.test(meta) ? 'han' : 'latin'), meta).toBeNull();
    }
  });

  it('says nothing for what is not a line: null, not a string, empty, or longer than a line', () => {
    for (const answer of [null, undefined, 42, {}, '', '   ', '「」', 'x '.repeat(200)]) expect(acceptInsight(answer, 'latin')).toBeNull();
  });
});

describe('mirrorInsight', () => {
  it('answers an English draft in English: it tells the model so, and a Chinese answer is never shown', async () => {
    chatJSON.mockResolvedValueOnce({ insight: 'A morning becomes yours the moment you stop rushing it.' });
    expect(await mirrorInsight({ title: EN_TITLE, story: EN })).toBe('A morning becomes yours the moment you stop rushing it');
    const [messages, opts] = chatJSON.mock.calls[0];
    expect(messages[0].content).toContain('English for an English draft. Never in Chinese.');
    expect(messages[1].content).toContain(EN_TITLE);
    expect(opts.signal).toBeInstanceOf(AbortSignal);

    // What the QA saw on Android: the old signature's Chinese examples pulled an English draft into Chinese.
    chatJSON.mockResolvedValueOnce({ insight: '獨立的早晨，從允許自己慢下來開始。' });
    expect(await mirrorInsight({ title: EN_TITLE, story: EN })).toBeNull();
  });

  it('answers a Chinese draft in Chinese', async () => {
    chatJSON.mockResolvedValueOnce({ insight: '屬於自己的早晨，從不必趕路開始。' });
    expect(await mirrorInsight({ title: ZH_TITLE, story: ZH })).toBe('屬於自己的早晨，從不必趕路開始');
    expect(chatJSON.mock.calls[0][0][0].content).toContain('Write it in Chinese');
  });

  it('says nothing, and asks no model, for a draft too short to reflect', async () => {
    for (const [title, story] of [['', ''], ['今天', '很累。'], ['Tired', 'Long day today.'], ['', '一行字而已，沒有更多']]) {
      expect(draftUnits(title, story)).toBeLessThan(MIN_DRAFT_UNITS);
      expect(await mirrorInsight({ title, story })).toBeNull();
    }
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("says nothing when the model finds nothing to say, or says it in commentary (iOS saw \"I need the actual story details\")", async () => {
    chatJSON.mockResolvedValueOnce({ insight: null });
    expect(await mirrorInsight({ title: EN_TITLE, story: EN })).toBeNull();
    chatJSON.mockResolvedValueOnce({ insight: 'I need the actual story details to find the insight.' });
    expect(await mirrorInsight({ title: EN_TITLE, story: EN })).toBeNull();
    chatJSON.mockResolvedValueOnce({ core_insight: 'a field it was not asked for' });
    expect(await mirrorInsight({ title: EN_TITLE, story: EN })).toBeNull();
  });
});
