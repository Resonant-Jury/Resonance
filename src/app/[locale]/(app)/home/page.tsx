'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { penWave } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { useFeed, useRecommendedFeed } from '@/lib/data/hooks';
import styles from './page.module.css';

/** Which stream opened the page — fixed the moment the first cards show. */
type Lead = 'recommended' | 'latest';

export default function HomeFeedPage() {
  const t = useTranslations('home');
  const tNav = useTranslations('app.nav');
  const { data, isLoading, isLoadingMore, hasMore, loadMore } = useFeed();
  const { data: rec, isLoading: recLoading } = useRecommendedFeed();
  const recCards = rec?.cards ?? [];
  const hasRec = recCards.length > 0;
  const latestCards = data?.cards ?? [];

  // One feed, two streams, and whichever reaches the reader first leads:
  //  - today's picks, when they're ready by then: picks first (no section
  //    header, no page title), and「載入更多」reveals the
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
    <div className={styles.page}>
      {/* No page title: the bar's wordmark says where this is, and the first card sits right under it.
          The heading stays for a screen reader's outline. */}
      <h1 className={styles.srOnly}>{tNav('home')}</h1>

      {loading ? (
        <FeedSkeleton count={6} seamTop />
      ) : isEmpty ? (
        <EmptyState
          icon="pen"
          seed={31}
          titleAs="h2"
          title={t('empty.title')}
          line={t('empty.subtitle')}
          action={
            <Link href="/write" style={{ textDecoration: 'none' }}>
              <OrganicButton variant="primary" size="sm">{t('empty.cta')}</OrganicButton>
            </Link>
          }
        />
      ) : (
        <>
          <div ref={feedTopRef} className={styles.feedTop} />
          {picksWaiting && (
            // Takes no room of its own: the pill floats over the first card, under the bar.
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
          {feedCards.length > 0 && <CardLinkGrid cards={feedCards} authors={feedAuthors} seamTop />}

          <footer className={styles.foot}>
            {(!latestVisible || hasMore) ? (
              <OrganicButton
                variant="textAccent"
                onClick={() => (latestVisible ? loadMore() : setShowLatest(true))}
              >
                {isLoadingMore ? t('moreLoading') : t('moreBtn')}
              </OrganicButton>
            ) : (
              // Nothing more can load: a small end mark and one quiet line, not a heading.
              <FeedEnd label={t('feedEnd')} />
            )}
          </footer>
        </>
      )}
    </div>
  );
}

/** The feed's end: a short pen wave with a dot after it, and one quiet line under them. */
function FeedEnd({ label }: { label: string }) {
  const d = useMemo(() => penWave(40, 307, 1.2, 4.5), []);
  return (
    <div className={styles.end}>
      <svg className={styles.endMark} width={49} height={8} viewBox="0 -4 49 8" aria-hidden>
        <path
          d={d}
          fill="none"
          stroke="var(--field-border-hover)"
          strokeOpacity={0.7}
          strokeWidth={INK}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={46.6} cy={0} r={1.6} fill="var(--color-terracotta)" />
      </svg>
      <p className={styles.endLine}>{label}</p>
    </div>
  );
}
