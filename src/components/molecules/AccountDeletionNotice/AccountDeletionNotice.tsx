'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { cancelMyAccountDeletion, getMyAccountDeletion } from '@/lib/account/client';

/**
 * Shown to a signed-in person whose account is scheduled for deletion: a
 * modal over the dimmed page saying when it happens, with a one-tap cancel.
 * Signing back in during the grace period is exactly how deletion gets
 * undone, so this is the undo surface. Keeping the deletion closes it until
 * the next visit (the apps: until the next launch).
 */
export function AccountDeletionNotice() {
  const t = useTranslations('accountDeletion');
  const locale = useLocale();
  const { user, loading } = useAuth();
  const { data, mutate } = useSWR(user && !loading ? `accountDeletion:${user.id}` : null, getMyAccountDeletion);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

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
    <ConfirmModal
      open={!kept}
      title={t('title')}
      body={t('body', { date })}
      cancelLabel={t('keep')}
      confirmLabel={t('cancel')}
      onCancel={() => setKept(true)}
      onConfirm={() => void cancel()}
      busy={busy}
      error={error ? t('error') : undefined}
      seed={131}
    />
  );
}
