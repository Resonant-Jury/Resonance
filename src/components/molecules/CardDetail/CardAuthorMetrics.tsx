'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/providers/AuthProvider';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { AvatarGroup } from '@/components/atoms/AvatarGroup/AvatarGroup';
import { ResonatorsModal } from '@/components/molecules/ResonatorsModal/ResonatorsModal';
import { useResonators } from '@/lib/data/hooks';
import { useElementSize } from '@/lib/hooks/useElementSize';

export interface CardAuthorMetricsProps {
  cardId: string;
  authorId: string;
}

/**
 * Author-only block on the card detail page. Instead of a raw resonance count,
 * it shows an avatar group of the latest resonators; clicking opens the full
 * resonator list.
 */
export function CardAuthorMetrics({ cardId, authorId }: CardAuthorMetricsProps) {
  const t = useTranslations('card');
  const { user } = useAuth();
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref, 700, 120);
  const isAuthor = !!user && user.id === authorId;
  const { data: resonators } = useResonators(isAuthor ? cardId : undefined);
  const [open, setOpen] = useState(false);

  if (!isAuthor) return null;

  const list = resonators ?? [];

  return (
    <aside ref={ref} style={{ position: 'relative', padding: 24, marginBottom: 40 }}>
      <HandDrawnBorder
        w={w}
        h={h}
        R={18}
        seed={53}
        fillColor="oklch(94% 0.03 75 / 0.5)"
        strokeColor="oklch(72% 0.05 75 / 0.55)"
        strokeWidth={1.5}
        chalkSeed={3}
      />
      <div style={{ position: 'relative' }}>
        <h4
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            marginBottom: 14,
          }}
        >
          {t('resonatedBy')}
        </h4>
        {list.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{t('noResonatorsYet')}</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AvatarGroup
              members={list.map((u) => ({
                id: u.id,
                initials: u.initials,
                accentColor: u.accentColor,
                avatarSeed: u.avatarSeed,
              }))}
              max={3}
              size={40}
              onClick={() => setOpen(true)}
              ariaLabel={t('viewAllResonators')}
            />
            <button
              type="button"
              onClick={() => setOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--color-terracotta)',
                padding: 0,
              }}
            >
              {t('viewAllResonators')}
            </button>
          </div>
        )}
      </div>

      <ResonatorsModal open={open} onClose={() => setOpen(false)} resonators={list} />
    </aside>
  );
}
