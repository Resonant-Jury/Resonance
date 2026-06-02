import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { CardQuote } from './CardQuote';

/**
 * Loading state for the card detail page. Reuses the real article layout and
 * spacing — only the avatar, text, tags and icons become grey blocks. Keeps the
 * organic CardQuote chrome so there's no visual style jump when content arrives.
 */
export function CardDetailSkeleton({ hue = 55 }: { hue?: number }) {
  return (
    <article style={{ maxWidth: 760, margin: '0 auto' }} role="status" aria-label="Loading">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <Skeleton width={44} height={44} circle />
        <div style={{ flex: 1 }}>
          <Skeleton width={140} height={15} />
          <Skeleton width={96} height={13} style={{ marginTop: 7 }} />
        </div>
      </header>

      <CardQuote hue={hue} loading />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        <Skeleton height={17} />
        <Skeleton height={17} />
        <Skeleton height={17} />
        <Skeleton height={17} width="65%" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
        <Skeleton width={64} height={26} radius={13} />
        <Skeleton width={84} height={26} radius={13} />
        <Skeleton width={56} height={26} radius={13} />
      </div>
    </article>
  );
}
