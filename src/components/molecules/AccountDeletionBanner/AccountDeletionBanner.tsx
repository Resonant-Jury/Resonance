'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { cancelMyAccountDeletion, getMyAccountDeletion } from '@/lib/account/client';
import styles from './AccountDeletionBanner.module.css';

/**
 * Shown to a signed-in person whose account is scheduled for deletion: the
 * date it happens and a one-tap cancel. Signing back in during the grace
 * period is exactly how deletion gets undone, so this is the undo surface.
 */
export function AccountDeletionBanner({ belowHeader = true }: { belowHeader?: boolean }) {
  const t = useTranslations('accountDeletion');
  const locale = useLocale();
  const { user, loading } = useAuth();
  const { data, mutate } = useSWR(user && !loading ? `accountDeletion:${user.id}` : null, getMyAccountDeletion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 0, 0, [!!data]);

  if (!data) return null;

  const date = new Date(data.purgeAfter).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await cancelMyAccountDeletion();
      await mutate(null, { revalidate: false });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap} data-below-header={belowHeader || undefined} role="status">
      <div ref={ref} className={styles.banner}>
        <HandDrawnBorder
          w={w}
          h={h}
          R={18}
          seed={131}
          fillColor="var(--color-card-bg)"
          strokeColor="var(--color-danger, oklch(58% 0.16 25))"
        />
        <p className={styles.text}>
          {t('banner', { date })}
          {error && <span className={styles.error}> {t('error')}</span>}
        </p>
        <span>
          {/* The banner has its own danger-red pen line, so its undo draws none. */}
          <OrganicButton variant="textAccent" size="sm" onClick={() => void cancel()} loading={busy}>
            {t('cancel')}
          </OrganicButton>
        </span>
      </div>
    </div>
  );
}
