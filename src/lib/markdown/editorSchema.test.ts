// @vitest-environment jsdom
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { getMarkdown, storyExtensions } from './editorSchema';

// The story editor's storage format, pinned. Every case in the corpus is
// loaded into the editor schema and written back; the result must equal the
// case's recorded canonical form, and writing the canonical form back must
// not change it again. The native apps' editor island asserts against the
// same file (native/fixtures/markdown-corpus.json), so web and native agree
// on exactly how a story is stored.
//
// After an intentional schema change, regenerate and review the diff:
//   UPDATE_MARKDOWN_CORPUS=1 npx vitest run src/lib/markdown/editorSchema.test.ts

const FIXTURES = resolve(__dirname, '../../../native/fixtures');

interface Case {
  id: string;
  markdown: string;
  canonical?: string;
}

function roundtrip(markdown: string): string {
  const editor = new Editor({ extensions: storyExtensions(), content: markdown });
  const out = getMarkdown(editor);
  editor.destroy();
  return out;
}

if (process.env.UPDATE_MARKDOWN_CORPUS) {
  const input = JSON.parse(readFileSync(resolve(FIXTURES, 'markdown-corpus.input.json'), 'utf8')) as { note: string; cases: Case[] };
  const cases = input.cases.map((c) => ({ ...c, canonical: roundtrip(c.markdown) }));
  writeFileSync(resolve(FIXTURES, 'markdown-corpus.json'), `${JSON.stringify({ note: input.note, cases }, null, 2)}\n`);
}

const corpus = JSON.parse(readFileSync(resolve(FIXTURES, 'markdown-corpus.json'), 'utf8')) as { cases: Required<Case>[] };

describe('story Markdown round trip', () => {
  it.each(corpus.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const canonical = roundtrip(c.markdown);
    expect(canonical).toBe(c.canonical);
    expect(roundtrip(canonical)).toBe(canonical);
  });

  it('keeps the text of every case (normalization only touches syntax)', () => {
    const text = (md: string) => {
      const editor = new Editor({ extensions: storyExtensions(), content: md });
      // Block atoms (card embeds, images) carry their text in attributes.
      const parts: string[] = [];
      editor.state.doc.descendants((n) => {
        if (n.isText) parts.push(n.text ?? '');
        else if (n.type.name === 'cardEmbed') parts.push(String(n.attrs.title));
        else if (n.type.name === 'image') parts.push(String(n.attrs.alt));
      });
      editor.destroy();
      return parts.join('').replace(/\s+/g, '');
    };
    for (const c of corpus.cases) expect(text(c.canonical), c.id).toBe(text(c.markdown));
  });

  it('embeds a card only when its link stands alone, as the reader does', () => {
    const blocks = (md: string) => {
      const editor = new Editor({ extensions: storyExtensions(), content: md });
      const out: string[] = [];
      editor.state.doc.forEach((n) => {
        out.push(n.type.name === 'paragraph' && n.firstChild?.marks.some((m) => m.type.name === 'link') ? 'paragraph>link' : n.type.name);
      });
      editor.destroy();
      return out;
    };
    expect(blocks('[一場雨後的散步](/card/a-walk)')).toEqual(['cardEmbed']);
    expect(blocks('前言\n\n  [一場雨後的散步](/card/a-walk)  \n\n結尾')).toEqual(['paragraph', 'cardEmbed', 'paragraph']);
    expect(blocks('[一場雨後的散步](/card/a-walk) 是我最喜歡的一張')).toEqual(['paragraph>link']);
    expect(blocks('[一篇文章](https://example.com)')).toEqual(['paragraph>link']);
  });
});
