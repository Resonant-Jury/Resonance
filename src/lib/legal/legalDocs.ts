import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The policy pages (/privacy, /terms, /support, /child-safety) are Markdown
 * files in docs/legal — `{key}.{zh-TW|en}.md`, a small front matter (title,
 * description, updated) and the text. They are read when the site builds, so
 * editing a file and rebuilding is all a change takes. Links between them are
 * written as `./privacy.zh-TW.md` so they also work on GitHub; the site turns
 * them into its own paths.
 */
export const LEGAL_KEYS = ['privacy', 'terms', 'support', 'child-safety'] as const;
export type LegalDocKey = (typeof LEGAL_KEYS)[number];
export type LegalLang = 'zh-TW' | 'en';

export interface LegalDoc {
  title: string;
  description: string;
  /** YYYY-MM-DD, from the front matter. */
  updated: string;
  /** Markdown, links already pointing at the site's pages. */
  body: string;
}

export const LEGAL_DIR = path.join(process.cwd(), 'docs', 'legal');

export function legalLang(locale: string): LegalLang {
  return locale === 'zh-TW' ? 'zh-TW' : 'en';
}

const FILE_LINK = new RegExp(`\\]\\(\\./(${LEGAL_KEYS.join('|')})\\.(zh-TW|en)\\.md\\)`, 'g');

/** Split the front matter from the text and turn file links into site links. */
export function parseLegalMarkdown(raw: string): LegalDoc {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error('legal page without front matter');
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const field of ['title', 'description', 'updated'] as const) {
    if (!meta[field]) throw new Error(`legal page without "${field}"`);
  }
  const body = raw.slice(match[0].length).replace(FILE_LINK, '](/$2/$1)').trim();
  return { title: meta.title, description: meta.description, updated: meta.updated, body };
}

export function loadLegalDoc(key: LegalDocKey, locale: string): LegalDoc {
  return parseLegalMarkdown(readFileSync(path.join(LEGAL_DIR, `${key}.${legalLang(locale)}.md`), 'utf8'));
}

/** "最後更新：2026年9月30日" / "Last updated: September 30, 2026". */
export function legalUpdatedLabel(updated: string, locale: string): string {
  const lang = legalLang(locale);
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'Asia/Taipei' }).format(
    new Date(`${updated}T12:00:00+08:00`)
  );
  return lang === 'zh-TW' ? `最後更新：${date}` : `Last updated: ${date}`;
}
