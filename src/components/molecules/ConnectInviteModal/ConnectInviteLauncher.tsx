'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { remainingDailyQuota } from '@/lib/db/firestore/client/invites';
import { ConnectInviteModal } from './ConnectInviteModal';

export interface ConnectInviteLauncherProps {
  targetUser: { id: string; handle: string; initials: string; accentColor: string };
  referenceCardId?: string;
  /** Server-provided initial quota; refreshed on open. */
  dailyRemaining?: number;
  variant?: 'primary' | 'outline' | 'ghost';
  label?: string;
}

export function ConnectInviteLauncher({
  targetUser,
  referenceCardId,
  dailyRemaining,
  variant = 'outline',
  label,
}: ConnectInviteLauncherProps) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState<number>(dailyRemaining ?? 3);
  const t = useTranslations('card');

  const refreshQuota = useCallback(async () => {
    try {
      const n = await remainingDailyQuota();
      setRemaining(n);
    } catch {
      // ignore — fall back to server-provided / default
    }
  }, []);

  useEffect(() => {
    if (open) void refreshQuota();
  }, [open, refreshQuota]);

  return (
    <>
      <OrganicButton variant={variant} onClick={() => setOpen(true)}>
        {label ?? t('initiateConnect')}
      </OrganicButton>
      <ConnectInviteModal
        open={open}
        onClose={() => setOpen(false)}
        target={targetUser}
        referenceCardId={referenceCardId}
        dailyRemaining={remaining}
        onSent={() => {
          setRemaining((n) => Math.max(0, n - 1));
        }}
      />
    </>
  );
}
