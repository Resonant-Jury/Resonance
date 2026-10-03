import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../native/fixtures/story-link-cards.json';
import { soleLinkParagraphs, standaloneLinks, STORY_PREVIEW_LIMIT, unfurlable } from './storyLinks';

interface Case {
  id: string;
  markdown: string;
  soleLinks: string[];
  links: string[];
  inline?: string[];
}

const cases = fixture.cases as Case[];

describe('story link cards (native/fixtures/story-link-cards.json, shared with the apps)', () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect([...soleLinkParagraphs(c.markdown).values()]).toEqual(c.soleLinks);
    expect(standaloneLinks(c.markdown)).toEqual(c.links);
    for (const url of c.inline ?? []) expect(c.soleLinks).not.toContain(url);
  });

  it('covers every form and every refusal the rules name', () => {
    const ids = cases.map((c) => c.id);
    for (const id of ['bare-https', 'bare-www', 'angle-autolink', 'markdown-link', 'reference-links', 'inline-links-stay-inline', 'strikethrough', 'linked-picture', 'card-link-stays-an-embed', 'own-site', 'ip-addresses', 'cjk-tail', 'sentence-punctuation', 'quote-and-loose-list', 'duplicates', 'at-most-ten']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('soleLinkParagraphs', () => {
  it('keys each standalone paragraph by where it starts in the source, as the web reader looks it up', () => {
    const story = '開頭。\n\nhttps://example.com/a\n\n> [引用](https://example.com/b)\n';
    const found = soleLinkParagraphs(story);
    expect([...found]).toEqual([
      [story.indexOf('https://example.com/a'), 'https://example.com/a'],
      [story.indexOf('[引用]'), 'https://example.com/b'],
    ]);
  });

  it('reads nothing into a story without an address in it', () => {
    expect(soleLinkParagraphs('只是文字。\n\n[卡片](/card/x)').size).toBe(0);
  });

  it('takes the first definition of a label, as CommonMark does', () => {
    expect(standaloneLinks('[r]\n\n[r]: https://example.com/first\n[r]: https://example.com/second')).toEqual(['https://example.com/first']);
  });
});

describe('standaloneLinks', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('stops at the limit, keeping reading order', () => {
    const story = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}`).join('\n\n');
    expect(standaloneLinks(story)).toHaveLength(STORY_PREVIEW_LIMIT);
    expect(standaloneLinks(story, 3)).toEqual(['https://example.com/0', 'https://example.com/1', 'https://example.com/2']);
  });

  it("never unfurls the deployment's own host", () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.resonance.example');
    expect(standaloneLinks('https://preview.resonance.example/en/u/alice\n\nhttps://example.com/x')).toEqual(['https://example.com/x']);
  });
});

describe('unfurlable', () => {
  it('refuses our hosts (with or without a trailing dot) and IP addresses, and takes the rest', () => {
    expect(unfurlable('https://resonance.channel./en')).toBe(false);
    expect(unfurlable('https://www.resonance.channel/en')).toBe(false);
    expect(unfurlable('https://203.0.113.9/x')).toBe(false);
    expect(unfurlable('https://mine.example/x', 'mine.example')).toBe(false);
    expect(unfurlable('https://example.com/x')).toBe(true);
    expect(unfurlable('not a url')).toBe(false);
  });
});
