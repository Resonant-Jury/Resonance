'use client';

import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { useFeed, useRecommendedFeed } from '@/lib/data/hooks';
import { useHint } from '@/lib/hints';

export default function HomeFeedPage() {
  const t = useTranslations('home');
  const { data, isLoading, isLoadingMore, hasMore, loadMore } = useFeed();
  const { data: rec } = useRecommendedFeed();
  const reasonHint = useHint('feed-reason');
  const cards = data?.cards ?? [];
  const authors = data?.authors ?? {};
  const recCards = rec?.cards ?? [];
  const isEmpty = !isLoading && cards.length === 0;

  return (
    <div
      style={{
        maxWidth: 'var(--page-max-w-wide)',
        margin: '0 auto',
        padding:
          'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
      }}
    >
      <header style={{ marginBottom: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(32px, 5vw, 44px)',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}
        >
          {t('heading')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(15px, 1.8vw, 17px)',
            color: 'var(--color-text-muted)',
            maxWidth: 650,
            lineHeight: 1.6,
          }}
        >
          {t('subheading')}
        </p>
      </header>

      {recCards.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(22px, 3vw, 28px)',
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              {t('recommended.title')}
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-text-muted)' }}>
              {t('recommended.subtitle')}
            </p>
            {reasonHint.visible && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-terracotta)' }}>
                {t('recommended.hint')}
              </p>
            )}
          </div>
          <CardLinkGrid
            cards={recCards}
            authors={rec?.authors ?? {}}
            renderCaption={(card) => {
              const reason = rec?.reasons[card.id];
              return reason ? t('matchReason', { reason }) : null;
            }}
          />
        </section>
      )}

      {isLoading ? (
        <FeedSkeleton count={6} />
      ) : isEmpty ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 20px',
            color: 'var(--color-text-muted)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--color-text)', marginBottom: 8 }}>
            {t('empty.title')}
          </p>
          <p style={{ marginBottom: 24 }}>{t('empty.subtitle')}</p>
          <Link href="/write" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="primary">{t('empty.cta')}</OrganicButton>
          </Link>
        </div>
      ) : (
        <>
          <CardLinkGrid cards={cards} authors={authors} />
          <footer
            style={{
              marginTop: 64,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 22,
                color: 'var(--color-text)',
              }}
            >
              {t('endOfDay')}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {hasMore && (
                <OrganicButton variant="outline" onClick={loadMore}>
                  {isLoadingMore ? t('moreLoading') : t('moreBtn')}
                </OrganicButton>
              )}
              <Link href="/write" style={{ textDecoration: 'none' }}>
                <OrganicButton variant="primary">{t('writeResponse')}</OrganicButton>
              </Link>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
