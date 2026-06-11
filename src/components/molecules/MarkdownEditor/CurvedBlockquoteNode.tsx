'use client';

import Blockquote from '@tiptap/extension-blockquote';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Divider } from '@/components/atoms/Divider/Divider';
import styles from './MarkdownEditor.module.css';

function BlockquoteView() {
  return (
    <NodeViewWrapper as="blockquote" className={styles.blockquoteNode}>
      <Divider orientation="vertical" seed={5} color="var(--color-terracotta-light)" spacing={0} />
      <NodeViewContent className={styles.blockquoteBody} />
    </NodeViewWrapper>
  );
}

/**
 * Blockquote rendered through a node view so the editor shows the same
 * hand-drawn vertical curve as the published article (StoryMarkdown's
 * blockquote), instead of a flat border-left rule.
 */
export const CurvedBlockquoteNode = Blockquote.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockquoteView);
  },
});
