import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';

/**
 * Loading state for the card detail page. Reuses the real article layout and
 * spacing — only the avatar, image, text, tags and icons become grey blocks so
 * there's no visual style jump when content arrives.
 */
export function CardDetailSkeleton() {
  return (
    <article style={{ maxWidth: 760, margin: '0 auto' }} role="status" aria-label="Loading">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <Skeleton width={44} height={44} circle />
        <div style={{ flex: 1 }}>
          <Skeleton width={140} height={15} />
          <Skeleton width={96} height={13} style={{ marginTop: 7 }} />
        </div>
      </header>

      <Skeleton height={260} radius={18} style={{ display: 'block', marginBottom: 24 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        <Skeleton height={34} width="85%" />
        <Skeleton height={34} width="55%" />
      </div>

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
