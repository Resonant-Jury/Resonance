'use client';

import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { seedFromString } from '@/lib/design/prng';
import { CardEmbed } from '@/lib/markdown/editorSchema';
import { EmbedStoryCard } from '@/components/molecules/EmbedStoryCard/EmbedStoryCard';
import { useCardEmbed } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { NodeRemoveButton } from './NodeRemoveButton';
import styles from './MarkdownEditor.module.css';

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
 * A link to one of the author's cards (see CardEmbed for its Markdown), shown
 * as the mini horizontal {@link EmbedStoryCard} instead of a text link.
 * Backspace on the selected node deletes it natively; the node view adds an
 * explicit "×" button.
 */
export const CardEmbedNode = CardEmbed.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CardEmbedView);
  },
});
