import { describe, expect, it } from 'vitest';
import { DELETION_GRACE_DAYS } from '@/lib/account/constants';
import { LEGAL_DOCS, legalDoc, legalUpdated, type LegalDocKey } from '.';

const KEYS = Object.keys(LEGAL_DOCS) as LegalDocKey[];
const headings = (md: string) => md.match(/^## .+$/gm) ?? [];

describe('legal pages', () => {
  it('say the same things in both languages', () => {
    for (const key of KEYS) {
      const { en, 'zh-TW': zh } = LEGAL_DOCS[key];
      expect(headings(zh.body).length, key).toBe(headings(en.body).length);
      expect(zh.body.match(/^- /gm)?.length, key).toBe(en.body.match(/^- /gm)?.length);
      for (const doc of [en, zh]) {
        expect(doc.title && doc.description, key).toBeTruthy();
        expect(doc.body, key).toContain('ncchen99@gmail.com');
      }
    }
  });

  it('describe the deletion the code performs', () => {
    for (const key of ['privacy', 'support'] as const) {
      for (const doc of Object.values(LEGAL_DOCS[key])) {
        expect(doc.body).toMatch(new RegExp(`${DELETION_GRACE_DAYS} ?(天|days)`));
      }
    }
  });

  it('name every service that receives user data', () => {
    for (const doc of Object.values(LEGAL_DOCS.privacy)) {
      for (const name of ['Firebase', 'Cloudflare R2', 'OpenAI', 'Vercel', 'Apple', 'Google']) {
        expect(doc.body).toContain(name);
      }
    }
  });

  it('link to pages in the reader’s language', () => {
    expect(legalDoc('support', 'zh-TW').body).toContain('](/zh-TW/privacy)');
    expect(legalDoc('terms', 'en').body).toContain('](/en/privacy)');
    expect(legalDoc('support', 'ja').title).toBe('Support');
    expect(legalDoc('privacy', 'en').body).not.toMatch(/\]\(\/(privacy|terms|support)\)/);
  });

  it('date themselves', () => {
    expect(legalUpdated('zh-TW')).toBe('最後更新：2026年9月30日');
    expect(legalUpdated('en')).toBe('Last updated: September 30, 2026');
  });
});
