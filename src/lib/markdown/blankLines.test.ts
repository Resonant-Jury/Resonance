// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { OrganicImageNode } from '@/components/molecules/MarkdownEditor/OrganicImageNode';
import { SpacedParagraphNode } from '@/components/molecules/MarkdownEditor/SpacedParagraphNode';
import { BLANK_PARAGRAPH, isBlankParagraph } from '@/lib/markdown/blankLines';

/** An editor wired exactly like MarkdownEditor's, minus the React node views. */
function makeEditor(content: unknown) {
  return new Editor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      SpacedParagraphNode,
      OrganicImageNode,
      Markdown.configure({ html: false }),
    ],
    content: content as string,
  });
}

function toMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } })
    .markdown.getMarkdown();
}

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const emptyP = { type: 'paragraph' };
const image = { type: 'image', attrs: { src: 'https://cdn/x.webp', alt: 'x' } };

describe('blank paragraphs through the Markdown round trip', () => {
  it('keeps an empty line the writer left under an image', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [p('before'), image, emptyP, p('after')],
    });

    const markdown = toMarkdown(editor);
    // The blank line is written out as a paragraph holding a single NBSP —
    // plain Markdown, so nothing downstream has to know about it.
    expect(markdown).toContain(`\n\n${BLANK_PARAGRAPH}\n\n`);

    // ...and reopening the editor on that Markdown brings the line back,
    // with the image still its own block.
    const reopened = makeEditor(markdown);
    const types = reopened.state.doc.content.content.map((n) => n.type.name);
    expect(types).toEqual(['paragraph', 'image', 'paragraph', 'paragraph']);
    expect(toMarkdown(reopened)).toBe(markdown);

    editor.destroy();
    reopened.destroy();
  });

  it('does not invent a trailing blank line for an untouched story', () => {
    const editor = makeEditor({ type: 'doc', content: [p('one'), image, p('two')] });
    expect(toMarkdown(editor)).not.toContain(BLANK_PARAGRAPH);
    editor.destroy();
  });

  it('ignores the trailing empty paragraph the cursor rests on', () => {
    const editor = makeEditor({ type: 'doc', content: [p('one'), image, emptyP] });
    expect(toMarkdown(editor)).not.toContain(BLANK_PARAGRAPH);
    editor.destroy();
  });

  it('recognizes a rendered blank paragraph', () => {
    expect(isBlankParagraph(BLANK_PARAGRAPH)).toBe(true);
    expect(isBlankParagraph(` ${BLANK_PARAGRAPH} `)).toBe(true);
    expect(isBlankParagraph('')).toBe(false);
    expect(isBlankParagraph('hello')).toBe(false);
  });
});
