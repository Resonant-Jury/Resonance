'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import type { Card, User } from '@/lib/db/types';

export type TabKey = 'published' | 'private' | 'draft' | 'resonated' | 'linked' | 'thoughtMap';

export interface ProfileTabsProps {
  tabs: TabKey[];
  data?: Partial<Record<TabKey, Card[]>>;
  authors?: Record<string, User>;
  loading?: boolean;
}

export function ProfileTabs({ tabs, data = {}, authors = {}, loading = false }: ProfileTabsProps) {
  const [active, setActive] = useState<TabKey>(tabs[0]);
  const t = useTranslations('me');
  const list = data[active] ?? [];
  return (
    <div>
      <OrganicTabs
        aria-label={t('tabs.published')}
        seed={23}
        tabs={tabs.map((key) => ({ key, label: t(`tabs.${key}`) }))}
        active={active}
        onChange={setActive}
        className="profile-tabs"
        variant="surface"
      />
      <div style={{ marginBottom: 28 }} />
      {loading ? (
        <FeedSkeleton count={6} />
      ) : active === 'thoughtMap' ? (
        <p style={{ color: 'var(--color-text-muted)', padding: '40px 0', textAlign: 'center' }}>
          {t('thoughtMapSoon')}
        </p>
      ) : list.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', padding: '40px 0', textAlign: 'center' }}>
          {t(
            active === 'published'
              ? 'emptyPublished'
              : active === 'private'
              ? 'emptyPrivate'
              : active === 'draft'
              ? 'emptyDraft'
              : active === 'linked'
              ? 'emptyLinked'
              : 'emptyResonated'
          )}
        </p>
      ) : active === 'linked' ? (
        <MiniCardGrid cards={list} authors={authors} />
      ) : (
        <CardLinkGrid cards={list} authors={authors} />
      )}
    </div>
  );
}

