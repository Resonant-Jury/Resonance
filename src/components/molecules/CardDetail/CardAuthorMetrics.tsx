'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/providers/AuthProvider';

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
  if (!user || user.id !== authorId) return null;

  return (
    <aside
      style={{
        padding: 24,
        borderRadius: 20,
        background: 'oklch(94% 0.03 75 / 0.4)',
        marginBottom: 40,
      }}
    >
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
