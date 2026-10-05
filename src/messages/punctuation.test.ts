import { describe, expect, it } from 'vitest';
import en from './en.json';
import zh from './zh-TW.json';

// The copy rule (CLAUDE.md, "Copy"): a UI string of one sentence or a
// fragment ends without a full stop — 「這是你們對話的開頭」, "No drafts" —
// and a string of two or more sentences keeps every stop, the last one too,
// so the paragraph reads evenly. ？ ！ … ⋯ stay wherever they are: they carry
// the tone. English also keeps the period on the body of an alert or confirm
// dialog written as a full sentence (Apple's style), listed below.

type Tree = { [key: string]: string | Tree };
function flatten(tree: Tree, prefix = '', out: [string, string][] = []): [string, string][] {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push([path, value]);
    else flatten(value, path, out);
  }
  return out;
}

/** Closing quotes and brackets a sentence's end may sit inside or before. */
const CLOSERS = '」』"”’）)';
const zhEnd = new RegExp(`[。！？][${CLOSERS}]*$`);
const zhFullStopEnd = new RegExp(`。[${CLOSERS}]*$`);

/** Sentences in a zh-TW string: each 。！？ inside it ends one, and the text after the last is one more. */
function zhSentences(text: string): number {
  return (text.replace(zhEnd, '').match(/[。！？]/g) ?? []).length + 1;
}

/** Sentences in an English string: a . ! or ? followed by a space ends one (e.g. and i.e. don't). */
function enSentences(text: string): number {
  const body = text.replace(/\b(e\.g|i\.e|etc|vs)\./gi, '').replace(new RegExp(`[.!?][${CLOSERS}]*$`), '');
  return (body.match(new RegExp(`[.!?][${CLOSERS}]*\\s`, 'g')) ?? []).length + 1;
}

/**
 * English dialog bodies of one full sentence that keep their period. Every
 * other one-sentence English string — titles, labels, buttons, placeholders,
 * hints, captions, empty states, status lines, toasts, inline errors — ends
 * without one. (A dialog body of two or more sentences keeps its periods by
 * the general rule and needs no entry.)
 */
const EN_DIALOG_BODIES: Record<string, string> = {
  'app.signOutConfirm.body': 'the sign-out confirm dialog',
  'write.leaveBodyRevision': "the writer's leave dialog, for a published card",
  'me.actions.deleteConfirmBody': 'the delete-card confirm dialog',
  'safety.report.doneBlocked': "the report dialog's thanks, under its two-sentence body",
};

const zhStrings = flatten(zh as Tree);
const enStrings = flatten(en as Tree);

describe('copy punctuation', () => {
  it('counts sentences the way the rule means', () => {
    expect(zhSentences('這是你們對話的開頭')).toBe(1);
    expect(zhSentences('這是你們對話的開頭。')).toBe(1);
    expect(zhSentences('還不想公開？把這段話寄給作者就好。')).toBe(2);
    expect(zhSentences('這張卡片的體悟是「{coreInsight}」。你有過類似的經驗嗎？')).toBe(2);
    expect(enSentences('No drafts.')).toBe(1);
    expect(enSentences('e.g. Being seen matters more than being liked')).toBe(1);
    expect(enSentences('That didn’t go through. Try again.')).toBe(2);
    expect(enSentences('Not ready to go public? Send it to the author as a note instead.')).toBe(2);
  });

  it('zh-TW: a string of one sentence (or a fragment) does not end with 。', () => {
    const offenders = zhStrings.filter(([, text]) => zhSentences(text) === 1 && zhFullStopEnd.test(text));
    expect(offenders).toEqual([]);
  });

  it('zh-TW: a string of two or more sentences ends its last sentence too', () => {
    const offenders = zhStrings.filter(([, text]) => zhSentences(text) >= 2 && !/[。！？…⋯][」』"”’）)]*$/.test(text));
    expect(offenders).toEqual([]);
  });

  it('en: a string of one sentence does not end with a period, unless it is a dialog body', () => {
    const offenders = enStrings.filter(
      ([key, text]) => enSentences(text) === 1 && /[^.]\.$/.test(text) && !(key in EN_DIALOG_BODIES),
    );
    expect(offenders).toEqual([]);
  });

  it('en: every listed dialog body is still a one-sentence string ending with a period', () => {
    const byKey = new Map(enStrings);
    for (const key of Object.keys(EN_DIALOG_BODIES)) {
      const text = byKey.get(key);
      expect(text, key).toMatch(/[^.]\.$/);
      expect(enSentences(text!), key).toBe(1);
    }
  });

  it('en: a string of two or more sentences ends its last sentence too', () => {
    const offenders = enStrings.filter(([, text]) => enSentences(text) >= 2 && !/[.!?…][”’"')]*$/.test(text));
    expect(offenders).toEqual([]);
  });
});
