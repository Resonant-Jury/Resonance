'use client';

import { useTranslations } from 'next-intl';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';

export interface SignOutConfirmModalProps {
  open: boolean;
  /** Sign-out in flight — dims the actions and blocks dismissal. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 「確定要登出嗎？」— the one confirm dialog for every sign-out affordance
 * (settings page, header account menu), so the copy and layout never drift
 * between them.
 */
export function SignOutConfirmModal({ open, busy = false, onCancel, onConfirm }: SignOutConfirmModalProps) {
  const t = useTranslations('app.signOutConfirm');
  return (
    <ConfirmModal
      open={open}
      title={t('title')}
      body={t('body')}
      cancelLabel={t('cancel')}
      confirmLabel={t('confirm')}
      onCancel={onCancel}
      onConfirm={onConfirm}
      busy={busy}
      seed={67}
    />
  );
}
