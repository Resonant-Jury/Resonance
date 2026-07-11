'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CardActionsMenu } from '@/components/molecules/CardActionsMenu/CardActionsMenu';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link, useRouter } from '@/i18n/navigation';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { CARD_HUES } from '@/components/molecules/StoryCard/StoryCard';
import { nearestCardHue } from '@/lib/design/dominantHue';
import type { Card, User } from '@/lib/db/types';

export type TabKey =
  | 'published'
  | 'private'
  | 'draft'
  | 'resonated'
  | 'linked'
  | 'bookmarks'
  | 'thoughtMap';

/** Tabs whose cards belong to the viewer and therefore carry the「⋯」menu. */
const OWNED_TABS: ReadonlySet<TabKey> = new Set(['published', 'private', 'draft']);

export interface ProfileTabsProps {
  tabs: TabKey[];
  data?: Partial<Record<TabKey, Card[]>>;
  authors?: Record<string, User>;
  loading?: boolean;
  /**
   * Card-box mode: the viewer owns the published/private/draft cards, so they
   * get the edit / visibility / delete menu, and draft cards link straight to
   * the editor instead of a detail page.
   */
  manageable?: boolean;
  /**
   * When set, the「thoughtMap」tab is a navigation jump rather than an in-page
   * panel: clicking it routes here (the full-screen map editor) instead of
   * switching the active tab.
   */
  thoughtMapHref?: string;
}

export function ProfileTabs({
  tabs,
  data = {},
  authors = {},
  loading = false,
  manageable = false,
  thoughtMapHref,
}: ProfileTabsProps) {
  const [active, setActive] = useState<TabKey>(tabs[0]);
  const t = useTranslations('me');
  const router = useRouter();
  const list = data[active] ?? [];
  const managed = manageable && OWNED_TABS.has(active);

  // The thought map opens as its own full-screen editor; selecting that tab is
  // a jump, not an in-place panel switch, so the active tab never lands on it.
  const handleChange = (key: TabKey) => {
    if (key === 'thoughtMap' && thoughtMapHref) {
      router.push(thoughtMapHref);
      return;
    }
    setActive(key);
  };

  return (
    <div>
      <OrganicTabs
        aria-label={t('tabs.published')}
        seed={23}
        tabs={tabs.map((key) => ({ key, label: t(`tabs.${key}`) }))}
        active={active}
        onChange={handleChange}
        className="profile-tabs"
        variant="surface"
      />
      <div style={{ marginBottom: 28 }} />
      {loading ? (
        <FeedSkeleton count={6} />
      ) : list.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            padding: '40px 0',
          }}
        >
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {t(
              active === 'published'
                ? 'emptyPublished'
                : active === 'private'
                ? 'emptyPrivate'
                : active === 'draft'
                ? 'emptyDraft'
                : active === 'linked'
                ? 'emptyLinked'
                : active === 'bookmarks'
                ? 'emptyBookmarks'
                : 'emptyResonated'
            )}
          </p>
          {/* The empty card box is the teaching moment (ux §4) — point it at
              the first story instead of leaving a dead end. */}
          {manageable && active === 'published' && (
            <Link href="/write" style={{ textDecoration: 'none' }}>
              <OrganicButton variant="primary">{t('emptyPublishedCta')}</OrganicButton>
            </Link>
          )}
        </div>
      ) : active === 'linked' ? (
        <MiniCardGrid cards={list} authors={authors} />
      ) : (
        <CardLinkGrid
          cards={list}
          authors={authors}
          // The owner's card box shows their own byline on anonymous cards —
          // the badge below marks them instead (ux §6: visible to self only).
          deanonymize={managed}
          renderCaption={
            managed
              ? (c) =>
                  c.anonymous ? (
                    <TagPill size="sm" color="var(--color-cream-dark)">
                      {t('anonymousBadge')}
                    </TagPill>
                  ) : null
              : undefined
          }
          // A draft has no public page yet — clicking it resumes writing.
          cardHref={managed && active === 'draft' ? (c) => `/write/${c.id}` : undefined}
          renderActions={
            managed
              ? (c, i) => {
                  // Match the card's own palette family (cover-image hue when
                  // known, else StoryCard's position-based rotation).
                  const cardHue =
                    c.accentHue != null ? nearestCardHue(c.accentHue) : CARD_HUES[i % CARD_HUES.length];
                  return (
                    <CardActionsMenu
                      card={{ id: c.id, visibility: c.visibility }}
                      seed={cardHue}
                      hue={cardHue}
                    />
                  );
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

