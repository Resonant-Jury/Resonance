import { Node, type AnyExtension } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { BLANK_PARAGRAPH } from './blankLines';

/**
 * The story editor's document schema and its Markdown mapping, with no UI.
 *
 * A story is stored as Markdown, so what the editor can hold — and exactly
 * how each node is written back — *is* the storage format. The web editor
 * (MarkdownEditor) adds React node views on top of these nodes; the native
 * apps' editor island (native/editor) adds plain DOM ones. Both serialize
 * through this module, so a story round-trips identically everywhere
 * (checked against native/fixtures/markdown-corpus.json).
 */

/** The slice of prosemirror-markdown's serializer state these nodes use. */
interface MarkdownSerializerState {
  write(content: string): void;
  closeBlock(node: PMNode): void;
  esc(text: string): string;
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
export const SpacedParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState & { renderInline(node: PMNode): void }, node: PMNode, parent: PMNode, index: number) {
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

/**
 * Images are block nodes here, so they serialize as their own Markdown block.
 * tiptap-markdown's default is the *inline* image serializer, which writes the
 * link and leaves the block open — whatever came next then ran onto the same
 * line as the photo.
 */
export const BlockImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const alt = state.esc(String(node.attrs.alt ?? ''));
          const src = String(node.attrs.src ?? '');
          const title = node.attrs.title ? ` "${state.esc(String(node.attrs.title))}"` : '';
          state.write(`![${alt}](${src}${title})`);
          state.closeBlock(node);
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});

/**
 * Block atom for a link to one of the author's cards. Serializes to plain
 * markdown `[title](/card/slug)` on its own line — the stored format is
 * unchanged, so existing stories round-trip.
 *
 * Only a card link that stands alone in its paragraph comes back as this
 * node, which is exactly when the reader (StoryMarkdown) draws it as an
 * embedded card. A card link inside a sentence stays an ordinary link:
 * turning it into a block would cut the writer's sentence in three.
 */
export const CardEmbed = Node.create({
  name: 'cardEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: '' },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        // Marked by `updateDOM` below (Markdown) or by renderHTML (copy and
        // paste inside the editor). Select in the selector itself: matching
        // every `a[href]` and declining the rest in getAttrs made ProseMirror
        // split the paragraph around *any* link.
        tag: 'a[data-card-embed]',
        priority: 100,
        getAttrs: (el) => {
          const a = el as HTMLAnchorElement;
          return { href: a.getAttribute('href') ?? '', title: a.textContent ?? '' };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['a', { href: node.attrs.href, 'data-card-embed': '' }, node.attrs.title];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: Pick<MarkdownSerializerState, 'write' | 'closeBlock'>, node: PMNode) {
          const title = String(node.attrs.title).replace(/[[\]]/g, '\\$&').replace(/\n+/g, ' ');
          state.write(`[${title}](${node.attrs.href})`);
          state.closeBlock(node);
        },
        parse: {
          // markdown-it renders a lone card link as `<p><a href="/card/…">`;
          // lift it out of its paragraph and mark it, so it parses as this block.
          updateDOM(element: HTMLElement) {
            for (const p of Array.from(element.querySelectorAll('p'))) {
              const kids = Array.from(p.childNodes).filter((n) => !(n.nodeType === 3 && !n.textContent?.trim()));
              const a = kids.length === 1 && kids[0].nodeName === 'A' ? (kids[0] as Element) : null;
              if (a?.getAttribute('href')?.startsWith('/card/')) {
                a.setAttribute('data-card-embed', '');
                p.replaceWith(a);
              }
            }
          },
        },
      },
    };
  },
});

export interface StorySchemaNodes {
  paragraph?: AnyExtension;
  blockquote?: AnyExtension;
  image?: AnyExtension;
  cardEmbed?: AnyExtension;
}

/**
 * Every extension that shapes the stored Markdown. Pass node-view variants of
 * the nodes to render them differently; their Markdown stays the base's.
 */
export function storyExtensions(nodes: StorySchemaNodes = {}): AnyExtension[] {
  return [
    StarterKit.configure({ blockquote: false, paragraph: false }),
    nodes.paragraph ?? SpacedParagraph,
    nodes.blockquote ?? Blockquote,
    nodes.image ?? BlockImage,
    nodes.cardEmbed ?? CardEmbed,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
  ];
}

/** tiptap-markdown augments `editor.storage` at runtime; read it through here. */
export function getMarkdown(editor: { storage: unknown }): string {
  return (editor.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}
