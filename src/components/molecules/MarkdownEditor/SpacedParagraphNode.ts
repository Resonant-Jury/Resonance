import Paragraph from '@tiptap/extension-paragraph';
import type { Node as PMNode } from '@tiptap/pm/model';
import { BLANK_PARAGRAPH } from '@/lib/markdown/blankLines';

/** The slice of prosemirror-markdown's serializer state we lean on. */
interface MarkdownSerializerState {
  write(content: string): void;
  renderInline(node: PMNode): void;
  closeBlock(node: PMNode): void;
}

/**
 * Paragraph, with one addition: an empty one is written out as a line holding
 * a single non-breaking space instead of vanishing.
 *
 * Markdown collapses any run of blank lines into a single paragraph break, so
 * a writer who pressed Enter to give a photo room saw that room disappear the
 * moment the card rendered — and again when they reopened the editor. The
 * marker is ordinary Markdown text, so it survives every parser on the way to
 * the reader, where {@link isBlankParagraph} turns it back into space.
 *
 * The last block is exempt: a trailing empty paragraph is just where the
 * cursor happens to rest, not a decision about spacing.
 */
export const SpacedParagraphNode = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(
          state: MarkdownSerializerState,
          node: PMNode,
          parent: PMNode,
          index: number
        ) {
          if (node.content.size === 0 && index < parent.childCount - 1) {
            state.write(BLANK_PARAGRAPH);
            state.closeBlock(node);
            return;
          }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});
