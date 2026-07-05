'use client';

import { EmbedStoryCard } from '@/components/molecules/EmbedStoryCard/EmbedStoryCard';
import { useCardEmbed } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { Link } from '@/i18n/navigation';

/** Deterministic wobble seed so the shared card renders stably. */
function seedFromId(id: string): number {
  let h = 11;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 9973) + 1;
}

export interface MessageCardRefProps {
  cardId: string;
}

/**
 * A card shared inside a conversation — resolved through the same visibility-
 * enforced path as an in-article embed, then rendered as an {@link
 * EmbedStoryCard} linking to the card page. A card the viewer can't see (gone
 * private, deleted) simply renders nothing.
 */
export function MessageCardRef({ cardId }: MessageCardRefProps) {
  const data = useCardEmbed(`/card/${cardId}`);
  if (data.status !== 'ready') return null;
  const { card, author } = data;
  return (
    <Link
      href={`/card/${card.slug ?? card.id}` as `/card/${string}`}
      style={{ textDecoration: 'none', display: 'block', maxWidth: 320 }}
    >
      <EmbedStoryCard
        title={card.thoughtCore}
        author={card.anonymous ? undefined : author?.handle}
        imageUrl={card.media?.url}
        hue={card.accentHue}
        seed={seedFromId(card.id)}
      />
    </Link>
  );
}
