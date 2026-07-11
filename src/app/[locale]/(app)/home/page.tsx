'use client';

import { useState } from 'react';
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
  const { data: rec, isLoading: recLoading } = useRecommendedFeed();
  const reasonHint = useHint('feed-reason');
  // One feed, two stages: the recommender's picks first (no section header —
  // the page heading already says it), and「載入更多」reveals the latest
  // public cards deduped against the picks. Everything renders in a single
  // grid so revealed cards continue after the picks — filling to the right of
  // the last card, not starting a second block below.
  const [showLatest, setShowLatest] = useState(false);
  const recCards = rec?.cards ?? [];
  const hasRec = recCards.length > 0;
  const recIds = new Set(recCards.map((c) => c.id));
  const cards = (data?.cards ?? []).filter((c) => !recIds.has(c.id));
  const latestVisible = !hasRec || showLatest;
  const loading = isLoading || recLoading;
  const isEmpty = !loading && !hasRec && cards.length === 0;
  const feedCards = latestVisible ? [...recCards, ...cards] : recCards;
  const feedAuthors = { ...(data?.authors ?? {}), ...(rec?.authors ?? {}) };

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

      {loading ? (
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
          {hasRec && reasonHint.visible && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--color-terracotta)',
                marginBottom: 16,
              }}
            >
              {t('recommended.hint')}
            </p>
          )}
          {feedCards.length > 0 && (
            <CardLinkGrid
              cards={feedCards}
              authors={feedAuthors}
              quoteFor={(card) => {
                const reason = rec?.reasons[card.id];
                return reason ? t('matchReason', { reason }) : null;
              }}
            />
          )}

          <footer
            style={{
              marginTop: 64,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {latestVisible && (
              <p
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 22,
                  color: 'var(--color-text)',
                }}
              >
                {t('endOfDay')}
              </p>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {(!latestVisible || hasMore) && (
                <OrganicButton
                  variant="outline"
                  onClick={() => (latestVisible ? loadMore() : setShowLatest(true))}
                >
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
