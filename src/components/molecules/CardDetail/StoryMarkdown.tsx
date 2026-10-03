'use client';

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Element, ElementContent } from 'hast';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicStoryImage } from '@/components/atoms/OrganicImage/OrganicStoryImage';
import { CardEmbedLink } from '@/components/molecules/EmbedStoryCard/CardEmbedLink';
import { isBlankParagraph } from '@/lib/markdown/blankLines';
import { seedFromString } from '@/lib/design/prng';
import { storyLinkWave } from '@/lib/design/storyLinkWave';
import type { CSSProperties } from 'react';
import styles from './StoryMarkdown.module.css';

/** The paragraph's only element child (ignoring whitespace), if any. */
function soleElementChild(node: Element | undefined): Element | null {
  if (!node) return null;
  const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  const only = kids.length === 1 ? kids[0] : null;
  return only && only.type === 'element' ? only : null;
}

function hastText(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(hastText).join('');
  return '';
}

const components: Components = {
  // Links wear the pen's wavy underline as a repeating background, so a link
  // that wraps gets a stroke under every line (OrganicLink's absolutely
  // positioned svg can't follow a wrapped inline box).
  a: ({ node: _node, href, children, ...rest }) => {
    const wave = storyLinkWave(href ?? '');
    return (
      <a
        {...rest}
        href={href}
        className={styles.link}
        style={{ '--wave': wave.rest, '--wave-strong': wave.strong } as CSSProperties}
      >
        {children}
      </a>
    );
  },
  // Replace the flat accent border with a hand-drawn vertical curve.
  blockquote: ({ children }) => (
    <blockquote>
      <Divider orientation="vertical" seed={5} color="var(--color-terracotta-light)" spacing={0} />
      <div className={styles.blockquoteBody}>{children}</div>
    </blockquote>
  ),
  // Replace the default flat rule with the theme's thin wavy pen line, with
  // generous breathing room above and below.
  hr: () => <Divider seed={23} spacing="clamp(28px, 4vw, 40px)" />,
  // Story images get the same hand-drawn curved clip as the cover, hugging
  // the photo's natural size. Spans only, so it stays valid inside <p>.
  img: ({ src, alt }) => (
    <OrganicStoryImage
      className={styles.storyImage}
      src={String(src ?? '')}
      alt={alt ?? ''}
      seed={seedFromString(String(src ?? ''))}
    />
  ),
  // Paragraphs that hold a single card link become mini embedded story
  // cards; a paragraph holding a single photo becomes an image block with its
  // own breathing room (a photo should never touch the sentence above it, and
  // nobody should have to type blank lines to get that). A paragraph the
  // writer deliberately left blank renders as extra space. Everything else
  // stays prose.
  p: ({ node, children }) => {
    const sole = soleElementChild(node);
    if (sole?.tagName === 'a') {
      const href = String(sole.properties?.href ?? '');
      if (href.startsWith('/card/')) {
        return (
          <div className={styles.embedBlock}>
            <CardEmbedLink href={href} title={hastText(sole)} />
          </div>
        );
      }
    }
    if (sole?.tagName === 'img') {
      return <div className={styles.imageBlock}>{children}</div>;
    }
    if (node && isBlankParagraph(node.children.map(hastText).join(''))) {
      return <div className={styles.blankLine} aria-hidden="true" />;
    }
    return <p>{children}</p>;
  },
};

/**
 * Renders a card's story (stored as Markdown) into prose. `rehype-slug` adds
 * `id`s to headings so the Table of Contents can anchor-scroll to them.
 */
export function StoryMarkdown({ source }: { source: string }) {
  return (
    <div className={styles.prose}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {source}
      </Markdown>
    </div>
  );
}
