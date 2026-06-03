'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { OrganicTabs } from '@/components/molecules/OrganicTabs/OrganicTabs';
import type { Card, User } from '@/lib/db/types';

export type TabKey = 'published' | 'private' | 'draft' | 'resonated' | 'thoughtMap';

export interface ProfileTabsProps {
  tabs: TabKey[];
  data: Partial<Record<TabKey, Card[]>>;
  authors: Record<string, User>;
}

export function ProfileTabs({ tabs, data, authors }: ProfileTabsProps) {
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
      {active === 'thoughtMap' ? (
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
              : 'emptyResonated'
          )}
        </p>
      ) : (
        <CardLinkGrid cards={list} authors={authors} />
      )}
    </div>
  );
}
