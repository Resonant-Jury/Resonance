'use client';

import { useId } from 'react';
import { Link } from '@/i18n/navigation';
import { SharedCardContent, SharedCardSkeletonContent } from '@/components/molecules/SharedCard/SharedCard';
import { useStoryBlock } from '@/components/molecules/StoryLinkCard/useStoryBlock';
import { useCardEmbed } from './useCardEmbed';
import styles from './CardEmbedLink.module.css';

export interface CardEmbedLinkProps {
  href: string;
  /** Link label from the markdown source — the name while the card is read, and the fallback link's words. */
  title: string;
}

/**
 * A Resonance card standing alone in a story: a block in a story link card's
 * container (`useStoryBlock`: its fill, seeded outline, width, wash and
 * stand-in) holding the card as a thread draws a shared one
 * (`SharedCardContent`: byline, cover or band, title, excerpt, source), its
 * cover and band edge to edge, cut at the sides by the block's own outline.
 * The whole block is one link that opens the card, named by its title.
 *
 * While the card is read it is the shared card's skeleton in the same block;
 * a card the viewer can't see (private, gone, by someone they blocked) is the
 * plain text link the story wrote.
 */
export function CardEmbedLink({ href, title }: CardEmbedLinkProps) {
  const data = useCardEmbed(href);
  const titleId = useId();
  const block = useStoryBlock<HTMLAnchorElement>(href);

  if (data.status === 'error') {
    return <Link href={href}>{title}</Link>;
  }

  const ready = data.status === 'ready';
  return (
    <Link
      ref={block.ref}
      {...block.rootProps}
      className={`${block.rootProps.className} ${styles.embed}`}
      href={href}
      aria-labelledby={ready ? titleId : undefined}
      aria-label={ready ? undefined : title}
      aria-busy={ready ? undefined : true}
    >
      {block.layers}
      <span
        className={styles.content}
        // The block's own outline cuts what runs edge to edge (the cover, the band) at its sides.
        style={block.d ? { clipPath: `path('${block.d}')` } : undefined}
        data-clipped={block.d ? '' : undefined}
      >
        {ready ? (
          <SharedCardContent key={data.card.media?.url ?? ''} card={data.card} author={data.author} titleId={titleId} />
        ) : (
          <SharedCardSkeletonContent />
        )}
      </span>
    </Link>
  );
}
