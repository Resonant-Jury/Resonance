'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { getUserById, isConnected } from '@/lib/db/firestore/client/reads';
import { remainingDailyQuota } from '@/lib/db/firestore/client/invites';
import type { User } from '@/lib/db/types';
import { ConnectInviteModal } from './ConnectInviteModal';

export interface NotificationConnectActionProps {
  /** The person who resonated / sent the note — the potential connection. */
  fromUserId: string;
  /** The card that carried the interaction; becomes the invite's context. */
  referenceCardId?: string;
}

/**
 * The connect entry point that lives on interaction notifications (resonance,
 * and later notes). Relationships grow from stories: someone reached out with
 * a costly, story-shaped act, and the recipient may answer with a connection
 * invite — the profile page deliberately has no connect button anymore.
 *
 * Renders nothing while checking, when the pair is already connected shows a
 * quiet "connected" mark, otherwise a small invite button that opens the
 * existing ConnectInviteModal (mutual consent still runs through the normal
 * invite → accept path).
 */
export function NotificationConnectAction({
  fromUserId,
  referenceCardId,
}: NotificationConnectActionProps) {
  const { user: viewer } = useAuth();
  const t = useTranslations('app.notifications');
  const [state, setState] = useState<'checking' | 'connectable' | 'connected'>('checking');
  const [target, setTarget] = useState<User | null>(null);
  const [quota, setQuota] = useState(0);
  const [open, setOpen] = useState(false);

  const selfOrAnon = !viewer || viewer.id === fromUserId;

  useEffect(() => {
    if (selfOrAnon) return;
    let alive = true;
    isConnected(viewer.id, fromUserId)
      .then((connected) => {
        if (alive) setState(connected ? 'connected' : 'connectable');
      })
      .catch(() => {
        if (alive) setState('connectable');
      });
    return () => {
      alive = false;
    };
  }, [selfOrAnon, viewer?.id, fromUserId]);

  if (selfOrAnon) return null;
  if (state === 'checking') return null;

  if (state === 'connected') {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        ✿ {t('alreadyConnected')}
      </span>
    );
  }

  async function launch() {
    const [user, remaining] = await Promise.all([
      getUserById(fromUserId),
      remainingDailyQuota().catch(() => 0),
    ]);
    if (!user) return;
    setTarget(user);
    setQuota(remaining);
    setOpen(true);
  }

  return (
    <>
      <OrganicButton variant="ghost" onClick={() => void launch()}>
        {t('connect')}
      </OrganicButton>
      {target && (
        <ConnectInviteModal
          open={open}
          onClose={() => setOpen(false)}
          target={target}
          referenceCardId={referenceCardId}
          dailyRemaining={quota}
          onSent={() => setQuota((n) => Math.max(0, n - 1))}
        />
      )}
    </>
  );
}
