'use client';

import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import type { Node as PMNode } from '@tiptap/pm/model';
import { seedFromString } from '@/lib/design/prng';
import { EmbedStoryCard } from '@/components/molecules/EmbedStoryCard/EmbedStoryCard';
import { useCardEmbed } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { NodeRemoveButton } from './NodeRemoveButton';
import styles from './MarkdownEditor.module.css';

/** Minimal slice of tiptap-markdown's serializer state we rely on. */
interface MarkdownState {
  write(content: string): void;
  closeBlock(node: PMNode): void;
}

function CardEmbedView({ node, selected, deleteNode }: NodeViewProps) {
  const t = useTranslations('write.editor');
  const href = String(node.attrs.href ?? '');
  const data = useCardEmbed(href);
  const ready = data.status === 'ready';
  return (
    <NodeViewWrapper className={styles.cardEmbedNode} data-selected={selected || undefined}>
      <EmbedStoryCard
        title={ready ? data.card.thoughtCore : String(node.attrs.title ?? '')}
        author={ready ? data.author?.handle : undefined}
        imageUrl={ready ? data.card.media?.url : undefined}
        hue={ready ? data.card.accentHue : undefined}
        seed={seedFromString(href)}
        selected={selected}
      />
      {selected && <NodeRemoveButton onClick={() => deleteNode()} label={t('removeCard')} />}
    </NodeViewWrapper>
  );
}

/**
 * Block atom representing a link to one of the author's cards, shown as the
 * mini horizontal {@link EmbedStoryCard} instead of a text link. Serializes to
 * plain markdown `[title](/card/slug)` on its own line — the stored format is
 * unchanged, so existing stories round-trip: any standalone `/card/...` link
 * parses back into this node (the `a[href^="/card/"]` rule outranks the link
 * mark). Backspace on the selected node deletes it natively; the node view
 * adds an explicit "×" button.
 */
export const CardEmbedNode = Node.create({
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
        tag: 'a[href]',
        priority: 100,
        getAttrs: (el) => {
          const a = el as HTMLAnchorElement;
          const href = a.getAttribute('href') ?? '';
          return /^\/card\//.test(href) ? { href, title: a.textContent ?? '' } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['a', { href: node.attrs.href, 'data-card-embed': '' }, node.attrs.title];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardEmbedView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownState, node: PMNode) {
          const title = String(node.attrs.title).replace(/[[\]]/g, '\\$&').replace(/\n+/g, ' ');
          state.write(`[${title}](${node.attrs.href})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
