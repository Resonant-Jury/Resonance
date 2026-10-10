import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import { cardPalettes } from '@/lib/design/cardColours';
import gridStyles from '@/components/molecules/CardLinkGrid/CardLinkGrid.module.css';

/**
 * A grid of placeholder cards that reuses the real StoryCard layout (organic
 * border, fills, colours) and the same column grid as CardLinkGrid — only the
 * text, image and icons are swapped for grey blocks.
 */
export function FeedSkeleton({ count = 6, seamTop = false }: { count?: number; seamTop?: boolean }) {
  // Hue-less cards: by position, as the list's rule colours them.
  const palettes = cardPalettes(Array.from({ length: count }, () => null));
  return (
    <div className={gridStyles.grid} role="status" aria-label="Loading">
      {palettes.map((palette, i) => (
        <div key={i} className={gridStyles.item}>
          <StoryCard index={i} palette={palette} isLast={i === count - 1} isFirst={seamTop && i === 0} loading />
        </div>
      ))}
    </div>
  );
}
