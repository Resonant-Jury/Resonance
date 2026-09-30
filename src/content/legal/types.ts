/** A legal page's text in one language: its heading, a meta description, and a Markdown body. */
export interface LegalDocText {
  title: string;
  description: string;
  body: string;
}

/** The site's two languages (src/i18n/routing.ts). */
export type LegalText = Record<'zh-TW' | 'en', LegalDocText>;
