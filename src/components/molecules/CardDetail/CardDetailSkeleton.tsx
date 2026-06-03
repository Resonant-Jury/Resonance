import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import pageStyles from '@/app/[locale]/(app)/card/[id]/page.module.css';

/**
 * Loading state for the card detail page. Reuses the real article layout —
 * the two-column grid (article + sticky author/ToC rail) and the in-article
 * order (hero image → title → story → tags) — so there's no position or style
 * jump when content arrives. Only the avatar, image, text, tags and icons
 * become grey blocks. The compact author header is shown inline on mobile
 * (where the rail is hidden), matching the real page.
 */
export function CardDetailSkeleton() {
  return (
    <div className={pageStyles.layout} role="status" aria-label="Loading">
      <article className={pageStyles.article}>
        {/* Compact author header — mobile only, mirrors the real page. */}
        <header className={pageStyles.mobileAuthor}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton width={44} height={44} circle />
            <div style={{ flex: 1 }}>
              <Skeleton width={140} height={15} />
              <Skeleton width={96} height={13} style={{ marginTop: 7 }} />
            </div>
          </div>
        </header>

        {/* Hero cover image. */}
        <Skeleton
          height="clamp(180px, 38vw, 374px)"
          radius={18}
          className={pageStyles.heroImage}
          style={{ display: 'block' }}
        />

        {/* Title — two large lines matching the h1 rhythm. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          <Skeleton height={38} width="90%" />
          <Skeleton height={38} width="55%" />
        </div>

        {/* Story body. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          <Skeleton height={17} />
          <Skeleton height={17} />
          <Skeleton height={17} />
          <Skeleton height={17} width="65%" />
        </div>

        {/* Tags. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
          <Skeleton width={64} height={26} radius={13} />
          <Skeleton width={84} height={26} radius={13} />
          <Skeleton width={56} height={26} radius={13} />
        </div>
      </article>

      {/* Right rail: author intro on top, ToC below — desktop only. */}
      <aside className={pageStyles.aside}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton width={56} height={56} circle />
          <Skeleton width={120} height={16} />
          <Skeleton width={72} height={13} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <Skeleton height={13} />
            <Skeleton height={13} width="80%" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="85%" height={13} />
          <Skeleton width="70%" height={13} />
          <Skeleton width="78%" height={13} />
        </div>
      </aside>
    </div>
  );
}
