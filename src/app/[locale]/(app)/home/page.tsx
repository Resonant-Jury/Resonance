'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { useFeed, useRecommendedFeed } from '@/lib/data/hooks';
import styles from './page.module.css';

/** Which stream opened the page — fixed the moment the first cards show. */
type Lead = 'recommended' | 'latest';

export default function HomeFeedPage() {
  const t = useTranslations('home');
  const { data, isLoading, isLoadingMore, hasMore, loadMore } = useFeed();
  const { data: rec, isLoading: recLoading } = useRecommendedFeed();
  const recCards = rec?.cards ?? [];
  const hasRec = recCards.length > 0;
  const latestCards = data?.cards ?? [];

  // One feed, two streams, and whichever reaches the reader first leads:
  //  - today's picks, when they're ready by then: picks first (no section
  //    header — the page heading already says it), and「載入更多」reveals the
  //    latest public cards deduped against them;
  //  - otherwise the latest cards, the moment they arrive. Picks that come in
  //    after that never reshuffle what the reader is looking at: a small hint
  //    offers them, and only a click puts them on top.
  // Decided once (adjusting state during render, so no frame shows the other
  // order), and never back to the skeleton after.
  const [lead, setLead] = useState<Lead | null>(null);
  const nextLead: Lead | null = lead ?? (hasRec ? 'recommended' : latestCards.length > 0 ? 'latest' : null);
  if (nextLead !== lead) setLead(nextLead);

  const [showLatest, setShowLatest] = useState(false);
  const [picksRevealed, setPicksRevealed] = useState(false);
  const feedTopRef = useRef<HTMLDivElement>(null);

  const recIds = new Set(recCards.map((c) => c.id));
  const latestDeduped = latestCards.filter((c) => !recIds.has(c.id));
  const picksOnTop = nextLead === 'recommended' || (nextLead === 'latest' && picksRevealed && hasRec);
  const latestVisible = !picksOnTop || nextLead === 'latest' || showLatest;
  const feedCards = picksOnTop
    ? latestVisible
      ? [...recCards, ...latestDeduped]
      : recCards
    : latestCards;
  const feedAuthors = { ...(data?.authors ?? {}), ...(rec?.authors ?? {}) };
  const picksWaiting = nextLead === 'latest' && hasRec && !picksRevealed;

  // Nothing to show yet: the skeleton, until either stream has cards — or
  // both have answered with none (the empty state).
  const loading = nextLead === null && (isLoading || recLoading);
  const isEmpty = nextLead === null && !loading;

  function revealPicks() {
    setPicksRevealed(true);
    feedTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

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
          <div ref={feedTopRef} className={styles.feedTop} />
          {picksWaiting && (
            <div className={styles.picksHint}>
              <OrganicButton variant="primary" size="sm" onClick={revealPicks}>
                <span className={styles.picksHintLabel}>
                  <Icon name="sparkle" size={16} />
                  {t('recommended.ready')}
                </span>
              </OrganicButton>
            </div>
          )}

          {/* The recommender's reasons are deliberately not shown — an
              unexplained pick keeps the surprise of opening the card. */}
          {feedCards.length > 0 && <CardLinkGrid cards={feedCards} authors={feedAuthors} />}

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
                  variant="textAccent"
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
