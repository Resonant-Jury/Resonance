import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DELETION_GRACE_DAYS } from '@/lib/account/constants';
import { LEGAL_DIR, LEGAL_KEYS, legalUpdatedLabel, loadLegalDoc, parseLegalMarkdown } from './legalDocs';

const LANGS = ['zh-TW', 'en'] as const;
const headings = (md: string) => md.match(/^## .+$/gm) ?? [];

describe('policy pages (docs/legal)', () => {
  it('has every page in both languages, and nothing else', () => {
    const files = readdirSync(LEGAL_DIR).filter((f) => f.endsWith('.md')).sort();
    expect(files).toEqual(LEGAL_KEYS.flatMap((k) => LANGS.map((l) => `${k}.${l}.md`)).sort());
  });

  it('says the same things in both languages, as the team, with the team address', () => {
    for (const key of LEGAL_KEYS) {
      const zh = loadLegalDoc(key, 'zh-TW');
      const en = loadLegalDoc(key, 'en');
      expect(headings(zh.body).length, key).toBe(headings(en.body).length);
      expect(zh.body.match(/^- /gm)?.length, key).toBe(en.body.match(/^- /gm)?.length);
      expect(zh.updated, key).toBe(en.updated);
      for (const doc of [zh, en]) {
        expect(doc.body, key).toContain('assist.resonance@gmail.com');
        expect(doc.body, key).not.toMatch(/ncchen|Nian-Cheng/);
      }
    }
    expect(loadLegalDoc('privacy', 'zh-TW').body).toContain('由共振團隊開發與營運');
    expect(loadLegalDoc('terms', 'en').body).toContain('built and run by the Resonance team');
  });

  it('describes the deletion the code performs and every service that receives data', () => {
    for (const lang of LANGS) {
      for (const key of ['privacy', 'support'] as const) {
        expect(loadLegalDoc(key, lang).body).toMatch(new RegExp(`${DELETION_GRACE_DAYS} ?(天|days)`));
      }
      const privacy = loadLegalDoc('privacy', lang).body;
      for (const name of ['Firebase', 'Cloudflare R2', 'OpenAI', 'Vercel', 'Apple', 'Google']) {
        expect(privacy).toContain(name);
      }
    }
  });

  it('turns links between the files into the site’s pages in the same language', () => {
    expect(loadLegalDoc('support', 'zh-TW').body).toContain('](/zh-TW/privacy)');
    expect(loadLegalDoc('support', 'en').body).toContain('](/en/terms)');
    expect(loadLegalDoc('terms', 'ja').title).toBe('Terms of Use');
    for (const key of LEGAL_KEYS) {
      for (const lang of LANGS) expect(loadLegalDoc(key, lang).body).not.toContain('.md)');
    }
  });

  it('reads its front matter and refuses a file without it', () => {
    const doc = parseLegalMarkdown('---\ntitle: T: x\ndescription: D\nupdated: 2026-01-02\n---\n\nBody [p](./privacy.en.md)\n');
    expect(doc).toEqual({ title: 'T: x', description: 'D', updated: '2026-01-02', body: 'Body [p](/en/privacy)' });
    expect(() => parseLegalMarkdown('# no front matter')).toThrow();
    expect(() => parseLegalMarkdown('---\ntitle: T\n---\nx')).toThrow(/description/);
  });

  it('dates itself in the reader’s language', () => {
    expect(legalUpdatedLabel('2026-09-30', 'zh-TW')).toBe('最後更新：2026年9月30日');
    expect(legalUpdatedLabel('2026-09-30', 'en')).toBe('Last updated: September 30, 2026');
  });
});
