'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ResonateButton } from '@/components/molecules/ResonateButton/ResonateButton';
import { ConnectInviteLauncher } from '@/components/molecules/ConnectInviteModal/ConnectInviteLauncher';
import { useAuth } from '@/components/providers/AuthProvider';
import { hasResonated as fetchHasResonated } from '@/lib/db/firestore/client/resonances';

export interface CardViewerActionsProps {
  cardId: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
}

export function CardViewerActions({ cardId, author }: CardViewerActionsProps) {
  const t = useTranslations('card');
  const { user, loading } = useAuth();
  const [resonated, setResonated] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setResonated(false);
      return;
    }
    let alive = true;
    fetchHasResonated(cardId)
      .then((v) => {
        if (alive) setResonated(v);
      })
      .catch(() => {
        if (alive) setResonated(false);
      });
    return () => {
      alive = false;
    };
  }, [cardId, user]);

  if (loading) return null;
  if (user && user.id === author.id) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        padding: '24px 0',
        borderTop: '1px solid oklch(80% 0.02 75)',
        borderBottom: '1px solid oklch(80% 0.02 75)',
        marginBottom: 40,
      }}
    >
      {resonated !== null && <ResonateButton cardId={cardId} initialResonated={resonated} />}
      <Link href={`/write?ref=${cardId}`} style={{ textDecoration: 'none' }}>
        <OrganicButton variant="outline">{t('writeResponse')}</OrganicButton>
      </Link>
      {user && (
        <ConnectInviteLauncher
          targetUser={author}
          referenceCardId={cardId}
        />
      )}
    </div>
  );
}
