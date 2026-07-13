'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';

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
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth={400}
      seed={67}
      ariaLabel={t('title')}
    >
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
        {t('title')}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)', margin: '0 0 18px' }}>
        {t('body')}
      </p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          ...(busy ? { opacity: 0.6, pointerEvents: 'none' as const } : {}),
        }}
      >
        <OrganicButton variant="ghost" size="sm" onClick={onCancel}>
          {t('cancel')}
        </OrganicButton>
        <OrganicButton variant="primary" size="sm" onClick={onConfirm}>
          {busy ? '…' : t('confirm')}
        </OrganicButton>
      </div>
    </Modal>
  );
}
