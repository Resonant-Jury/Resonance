'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { downloadMyData, scheduleMyAccountDeletion } from '@/lib/account/client';
import { DELETION_GRACE_DAYS } from '@/lib/account/constants';
import styles from './DeleteAccountSection.module.css';

/**
 * Settings → 刪除帳號. Offers the backup download first, then schedules the
 * deletion (7-day grace), signs the person out and lands them on sign-in with
 * a note that signing back in cancels it.
 */
export function DeleteAccountSection() {
  const t = useTranslations('settings.delete');
  const locale = useLocale();
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(false);

  const purgeDate = new Date(Date.now() + DELETION_GRACE_DAYS * 86_400_000).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setError(false);
    try {
      await downloadMyData();
    } catch {
      setError(true);
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await scheduleMyAccountDeletion();
      await auth.signOut().catch(() => {});
      window.location.href = `/${locale}/signin?notice=deletion-scheduled`;
    } catch {
      setBusy(false);
      setConfirming(false);
      setError(true);
    }
  }

  const muted = { color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.65 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>{t('title')}</h3>
      <p style={muted}>{t('warn')}</p>
      <p style={muted}>{t('exportHint')}</p>
      {/* Two pills of one height: the backup in the secondary peach, and the
          way into the deletion in the red tint — it only opens the dialog,
          whose confirm is the solid red. */}
      <div className={styles.actions}>
        <OrganicButton variant="text" onClick={() => void exportData()}>
          <Icon name="document" size={16} />
          {exporting ? t('exporting') : t('export')}
        </OrganicButton>
        <OrganicButton variant="dangerTonal" onClick={() => setConfirming(true)}>
          <Icon name="trash" size={16} />
          {t('button')}
        </OrganicButton>
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger, oklch(58% 0.16 25))', fontSize: 13 }}>
          {t('error')}
        </p>
      )}
      <ConfirmModal
        open={confirming}
        title={t('confirmTitle')}
        body={t('confirmBody', { date: purgeDate })}
        cancelLabel={t('cancel')}
        confirmLabel={t('confirm')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmDelete()}
        busy={busy}
        destructive
        seed={73}
      />
    </div>
  );
}
