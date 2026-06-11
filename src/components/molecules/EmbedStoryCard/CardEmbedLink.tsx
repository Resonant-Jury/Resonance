'use client';

import { Link } from '@/i18n/navigation';
import { seedFromString } from '@/lib/design/prng';
import { EmbedStoryCard } from './EmbedStoryCard';
import { useCardEmbed } from './useCardEmbed';
import styles from './EmbedStoryCard.module.css';

export interface CardEmbedLinkProps {
  href: string;
  /** Link label from the markdown source — shown while loading / on fallback. */
  title: string;
}

/**
 * Article-side rendering of an embedded card link: fetches the card behind a
 * `/card/...` href and renders the mini {@link EmbedStoryCard} wrapped in a
 * locale-aware Link. While loading it holds the footprint with plain CSS
 * chrome; if the card isn't visible to the viewer it degrades to the original
 * text link.
 */
export function CardEmbedLink({ href, title }: CardEmbedLinkProps) {
  const data = useCardEmbed(href);

  if (data.status === 'error') {
    return <Link href={href}>{title}</Link>;
  }

  if (data.status === 'loading') {
    return (
      <span className={styles.skeleton}>
        <span className={styles.skeletonTitle}>{title}</span>
      </span>
    );
  }

  return (
    <Link href={href} className={styles.link}>
      <EmbedStoryCard
        title={data.card.thoughtCore}
        author={data.author?.handle}
        imageUrl={data.card.media?.url}
        hue={data.card.accentHue}
        seed={seedFromString(href)}
      />
    </Link>
  );
}
