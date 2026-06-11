'use client';

import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { OrganicStoryImage } from '@/components/atoms/OrganicImage/OrganicStoryImage';
import { seedFromString } from '@/lib/design/prng';
import { NodeRemoveButton } from './NodeRemoveButton';
import styles from './MarkdownEditor.module.css';

function ImageView({ node, selected, deleteNode }: NodeViewProps) {
  const t = useTranslations('write.editor');
  const src = String(node.attrs.src ?? '');
  return (
    <NodeViewWrapper className={styles.imageNode}>
      {/* Same curved clip as the published article; selection draws a
          hand-drawn stroke along that same curve instead of a rectangle. */}
      <OrganicStoryImage
        src={src}
        alt={String(node.attrs.alt ?? '')}
        seed={seedFromString(src)}
        framed={selected}
        draggable={false}
      />
      {selected && <NodeRemoveButton onClick={() => deleteNode()} label={t('removeImage')} />}
    </NodeViewWrapper>
  );
}

/**
 * The stock image node rendered through a node view so the editor shows the
 * exact organic curve the article will, a selection frame that follows that
 * curve, and an explicit "×" remove button. Backspace on the selected node
 * still deletes natively.
 */
export const OrganicImageNode = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
