import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import gridStyles from '@/components/molecules/CardLinkGrid/CardLinkGrid.module.css';

/**
 * A grid of placeholder cards that reuses the real StoryCard layout (organic
 * border, fills, colours) and the same column grid as CardLinkGrid — only the
 * text, image and icons are swapped for grey blocks.
 */
export function FeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={gridStyles.grid} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={gridStyles.item}>
          <StoryCard index={i} isLast={i === count - 1} loading />
        </div>
      ))}
    </div>
  );
}
