import { privacy } from './privacy';
import { terms } from './terms';
import { support } from './support';
import type { LegalDocText } from './types';

export type { LegalDocText, LegalText } from './types';

export const LEGAL_DOCS = { privacy, terms, support };
export type LegalDocKey = keyof typeof LEGAL_DOCS;

/** When the texts last changed (shown on each page). Bump it with any edit to them. */
export const LEGAL_UPDATED = '2026-09-30';

/** "最後更新：2026年9月30日" / "Last updated: September 30, 2026". */
export function legalUpdated(locale: string): string {
  const lang = locale === 'zh-TW' ? 'zh-TW' : 'en';
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'Asia/Taipei' }).format(
    new Date(`${LEGAL_UPDATED}T12:00:00+08:00`)
  );
  return lang === 'zh-TW' ? `最後更新：${date}` : `Last updated: ${date}`;
}

/**
 * A page's text in the given UI locale (English for any other), with its
 * site-relative links given that locale's prefix.
 */
export function legalDoc(key: LegalDocKey, locale: string): LegalDocText {
  const lang = locale === 'zh-TW' ? 'zh-TW' : 'en';
  const doc = LEGAL_DOCS[key][lang];
  return { ...doc, body: doc.body.replace(/\]\(\/(?!\/)/g, `](/${lang}/`) };
}
