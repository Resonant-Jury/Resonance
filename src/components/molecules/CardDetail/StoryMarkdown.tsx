'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import styles from './StoryMarkdown.module.css';

/**
 * Renders a card's story (stored as Markdown) into prose. `rehype-slug` adds
 * `id`s to headings so the Table of Contents can anchor-scroll to them.
 */
export function StoryMarkdown({ source }: { source: string }) {
  return (
    <div className={styles.prose}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
        {source}
      </Markdown>
    </div>
  );
}
