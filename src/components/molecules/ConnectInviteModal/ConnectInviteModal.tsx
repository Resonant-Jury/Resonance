'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { sendInvite } from '@/lib/db/firestore/client/invites';
import { getCurrentUserHandle } from '@/lib/db/firestore/client/profile';

export interface ConnectInviteModalProps {
  open: boolean;
  onClose: () => void;
  target: {
    id: string;
    handle: string;
    initials: string;
    accentColor: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };
  referenceCardId?: string;
  dailyRemaining: number;
  onSent?: () => void;
}

export function ConnectInviteModal({
  open,
  onClose,
  target,
  referenceCardId,
  dailyRemaining,
  onSent,
}: ConnectInviteModalProps) {
  const t = useTranslations('invite');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [fromHandle, setFromHandle] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getCurrentUserHandle()
      .then((h) => {
        if (alive) setFromHandle(h ?? '');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const len = message.length;
  const valid = len >= 14 && len <= 140 && dailyRemaining > 0;

  function submit() {
    if (!valid) return;
    setError(null);
    start(async () => {
      try {
        await sendInvite({ toUserId: target.id, message, referenceCardId, fromHandle });
        setSent(true);
        onSent?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={480} seed={73} padding="28px 28px 26px">
      {sent ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <HandDrawnAvatar
            src={target.avatarUrl}
            initials={target.initials}
            size={56}
            color={target.accentColor}
            seed={Number(target.avatarSeed) || 19}
          />
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              marginTop: 16,
              marginBottom: 6,
            }}
          >
            {t('sent')}
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
            {t('expiresIn', { days: 7 })}
          </p>
          <OrganicButton variant="outline" onClick={onClose}>
            {t('cancel')}
          </OrganicButton>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <HandDrawnAvatar
              src={target.avatarUrl}
              initials={target.initials}
              size={42}
              color={target.accentColor}
              seed={Number(target.avatarSeed) || 19}
            />
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {t('title')}
              </h3>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {target.handle}
              </div>
            </div>
          </div>

          {referenceCardId && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'color-mix(in oklch, var(--color-cream-dark) 60%, transparent)',
                fontSize: 13,
                color: 'var(--color-text-muted)',
                marginBottom: 14,
              }}
            >
              {t('referenceCard')}: #{referenceCardId.slice(-6)}
            </div>
          )}

          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              marginBottom: 8,
            }}
          >
            {t('messageLabel')}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
            maxLength={160}
            rows={4}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid oklch(80% 0.02 75)',
              background: 'var(--color-cream)',
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--color-text)',
              resize: 'vertical',
              marginBottom: 8,
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              marginBottom: 18,
            }}
          >
            <span>{len} / 140</span>
            <span>
              {dailyRemaining > 0
                ? t('quota', { n: dailyRemaining })
                : t('quotaFull')}
            </span>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 10,
                fontSize: 12,
                color: 'var(--color-terracotta)',
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <OrganicButton variant="ghost" onClick={onClose}>
              {t('cancel')}
            </OrganicButton>
            <div style={{ opacity: valid ? 1 : 0.5, pointerEvents: valid ? 'auto' : 'none' }}>
              <OrganicButton variant="primary" onClick={submit}>
                {pending ? '…' : t('send')}
              </OrganicButton>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
