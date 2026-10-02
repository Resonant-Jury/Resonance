/**
 * How long a story takes to read, in whole minutes (at least 1): the read
 * time every list shows beside a card (lib/api/v1/summary stores it; the web's
 * StoryCard counts it the same way when a card comes without one, see
 * lib/adapters/story).
 *
 * Chinese and Japanese run on without spaces and are read a character at a
 * time; English is read a word at a time. A story can hold both, so each part
 * is counted at its own rate and the two added up, with no locale needed.
 */

/** CJK characters read per minute: the rate every story was counted at before words were. */
export const CJK_CHARS_PER_MINUTE = 320;
/** Words read per minute, for text that spaces its words (English). */
export const WORDS_PER_MINUTE = 230;

/**
 * Han, kana, Hangul and bopomofo, with the punctuation set among them: the
 * CJK block's 、。「」 and the full-width forms' ，！１.
 */
const CJK = String.raw`\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}\p{scx=Bopo}　-〿＀-￯`;
/** A run of CJK characters (captured), or anything else up to the next space or CJK character. */
const RUN = new RegExp(`([${CJK}]+)|[^\\s${CJK}]+`, 'gu');
const WORDLIKE = /[\p{L}\p{N}]/u;

export function readMinutes(text: string): number {
  let chars = 0;
  let words = 0;
  for (const [run, cjk] of text.matchAll(RUN)) {
    if (cjk) chars += cjk.length;
    else if (WORDLIKE.test(run)) words++;
    // Marks that stand alone (Chinese text's …… and ——, Markdown's ## and -)
    // are counted as characters, as they always were.
    else chars += run.length;
  }
  return Math.max(1, Math.round(chars / CJK_CHARS_PER_MINUTE + words / WORDS_PER_MINUTE));
}
