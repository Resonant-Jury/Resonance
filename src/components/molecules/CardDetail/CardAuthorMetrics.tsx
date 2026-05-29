'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/providers/AuthProvider';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';

export interface CardAuthorMetricsProps {
  authorId: string;
  readCount: number;
  resonanceCount: number;
  inviteCount: number;
}

export function CardAuthorMetrics({
  authorId,
  readCount,
  resonanceCount,
  inviteCount,
}: CardAuthorMetricsProps) {
  const t = useTranslations('card');
  const { user } = useAuth();
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref, 700, 120);
  if (!user || user.id !== authorId) return null;

  return (
    <aside
      ref={ref}
      style={{
        position: 'relative',
        padding: 24,
        marginBottom: 40,
      }}
    >
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
        {t('authorMetrics.title')}
      </h4>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <Metric label={t('authorMetrics.reads')} value={readCount} />
        <Metric label={t('authorMetrics.resonances')} value={resonanceCount} />
        <Metric label={t('authorMetrics.inviteRequests')} value={inviteCount} />
      </div>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--color-text)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}
