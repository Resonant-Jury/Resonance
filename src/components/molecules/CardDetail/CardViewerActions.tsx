'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { SegmentedActionBar, type SegmentSpec } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { ConnectInviteModal } from '@/components/molecules/ConnectInviteModal/ConnectInviteModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { hasResonated as fetchHasResonated, toggleResonance } from '@/lib/db/firestore/client/resonances';
import { remainingDailyQuota } from '@/lib/db/firestore/client/invites';

export interface CardViewerActionsProps {
  cardId: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
}

export function CardViewerActions({ cardId, author }: CardViewerActionsProps) {
  const t = useTranslations('card');
  const router = useRouter();
  const { user, loading } = useAuth();
  const [resonated, setResonated] = useState<boolean | null>(null);
  const [pending, startResonance] = useTransition();

  // connect-invite modal state (was previously owned by ConnectInviteLauncher)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [quota, setQuota] = useState(3);
  const refreshQuota = useCallback(async () => {
    try {
      setQuota(await remainingDailyQuota());
    } catch {
      /* keep default */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setResonated(false);
      return;
    }
    let alive = true;
    fetchHasResonated(cardId)
      .then((v) => alive && setResonated(v))
      .catch(() => alive && setResonated(false));
    return () => {
      alive = false;
    };
  }, [cardId, user]);

  useEffect(() => {
    if (inviteOpen) void refreshQuota();
  }, [inviteOpen, refreshQuota]);

  if (loading) return null;
  if (user && user.id === author.id) return null;

  const toggle = () => {
    if (resonated === null) return;
    const prev = resonated;
    setResonated(!prev);
    startResonance(async () => {
      try {
        await toggleResonance(cardId, prev);
      } catch {
        setResonated(prev);
      }
    });
  };

  const segments: SegmentSpec[] = [];

  if (resonated !== null) {
    segments.push(
      resonated
        ? {
            key: 'resonate',
            icon: <Icon name="check" size={16} color="var(--color-terracotta)" />,
            label: t('resonated'),
            textColor: 'var(--color-terracotta)',
            fill: 'oklch(92% 0.05 45 / 0.85)',
            hoverOverlay: 'oklch(0% 0 0 / 0.06)',
            onClick: toggle,
          }
        : {
            key: 'resonate',
            icon: <Icon name="wave" size={16} color="var(--color-cream)" />,
            label: t('resonate'),
            textColor: 'var(--color-cream)',
            fill: 'var(--color-terracotta)',
            hoverOverlay: 'oklch(0% 0 0 / 0.14)',
            onClick: toggle,
          }
    );
  }

  segments.push({
    key: 'respond',
    icon: <Icon name="pen" size={16} color="var(--color-terracotta)" />,
    label: t('writeResponse'),
    onClick: () => router.push(`/write?ref=${cardId}`),
  });

  if (user) {
    segments.push({
      key: 'connect',
      icon: <Icon name="users" size={16} color="var(--color-terracotta)" />,
      label: t('initiateConnect'),
      fill: 'oklch(94% 0.035 45 / 0.7)',
      onClick: () => setInviteOpen(true),
    });
  }

  return (
    <div style={{ marginBottom: 40, opacity: pending ? 0.85 : 1, transition: 'opacity 160ms' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '24px 0' }}>
        <SegmentedActionBar segments={segments} />
      </div>

      {user && (
        <ConnectInviteModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          target={author}
          referenceCardId={cardId}
          dailyRemaining={quota}
          onSent={() => setQuota((n) => Math.max(0, n - 1))}
        />
      )}
    </div>
  );
}
