'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { deleteCard, updateCardSettings } from '@/lib/db/firestore/client/cards';
import type { Visibility } from '@/lib/db/types';
import styles from './CardActionsMenu.module.css';

export interface CardActionsMenuProps {
  card: { id: string; visibility: Visibility };
  /** Seed so the wobble of the trigger + dropped card is deterministic per card. */
  seed?: number;
  /** The accent hue of the card. If omitted, the menu rides the theme terracotta. */
  hue?: number;
  /** Called after the visibility changed (the card box and the viewer's profile lists are already read again). */
  onChanged?: () => void;
  /** Called after the card was deleted (e.g. navigate away from its detail page). */
  onDeleted?: () => void;
  className?: string;
}

type ActionKey = 'edit' | 'visibility' | 'delete';

/**
 * The owner-side「⋯」menu on a card: 編輯 / 轉為公開·私人 / 刪除. The trigger and
 * dropped panel come from {@link OrganicMenu} (the shared organic dropdown
 * language — wobbly chip, wavy pen dividers, per-row wash, danger wash on the
 * delete row); this component owns only the card business logic. Deleting asks
 * for confirmation in a {@link Modal} first. Changes go through the server
 * (PATCH / DELETE /api/v1/cards/{id}), which also drops the cached pages that
 * showed the card as it was and keeps the recommender's copy in step; then the
 * viewer's card box and profile lists are read again, so the card visibly
 * moves tabs / disappears without a reload.
 */
export function CardActionsMenu({
  card,
  seed = 7,
  hue,
  onChanged,
  onDeleted,
  className,
}: CardActionsMenuProps) {
  const t = useTranslations('me.actions');
  const router = useRouter();
  const { user } = useAuth();
  const { mutate } = useSWRConfig();

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isPrivate = card.visibility === 'private';
  const items: OrganicMenuItem[] = [
    { key: 'edit', icon: 'pen', label: t('edit') },
    {
      key: 'visibility',
      icon: isPrivate ? 'globe' : 'lock',
      label: isPrivate ? t('makePublic') : t('makePrivate'),
    },
    { key: 'delete', icon: 'trash', label: t('delete'), danger: true },
  ];

  // What this browser holds of the viewer's own cards: the card box's shelves, and
  // their profile's lists (profileCards: signed-out reads; profilePage: one
  // per profile they looked at, keyed by viewer).
  const refreshOwnLists = useCallback(() => {
    if (!user) return;
    const uid = user.id;
    void mutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith(`cardbox:${uid}:`) || key === `profileCards:${uid}` || (key.startsWith('profilePage:') && key.endsWith(`:${uid}`))),
    );
  }, [mutate, user]);

  async function choose(key: ActionKey) {
    if (busy) return;
    if (key === 'edit') {
      router.push(`/write/${card.id}`);
      return;
    }
    if (key === 'visibility') {
      setBusy(true);
      try {
        await updateCardSettings(card.id, { visibility: isPrivate ? 'public' : 'private' });
        refreshOwnLists();
        onChanged?.();
      } finally {
        setBusy(false);
      }
      return;
    }
    // delete → confirm first
    setConfirming(true);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCard(card.id);
      refreshOwnLists();
      setConfirming(false);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OrganicMenu
        items={items}
        onChoose={(key) => void choose(key as ActionKey)}
        label={t('menuLabel')}
        seed={seed}
        hue={hue}
        busy={busy}
        className={className}
      />

      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        seed={seed + 5}
        maxWidth={400}
        ariaLabel={t('deleteConfirmTitle')}
      >
        <h3 className={styles.confirmTitle}>{t('deleteConfirmTitle')}</h3>
        <p className={styles.confirmBody}>{t('deleteConfirmBody')}</p>
        {/* OrganicButton has no disabled prop — gate via pointer-events while deleting. */}
        <div
          className={styles.confirmActions}
          style={busy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          {/* The modal is the frame: "keep it" is plain text, and deleting — which can't be undone — is red. */}
          <OrganicButton variant="text" size="sm" onClick={() => setConfirming(false)}>
            {t('deleteCancel')}
          </OrganicButton>
          <OrganicButton variant="danger" size="sm" onClick={() => void confirmDelete()}>
            {busy ? '…' : t('deleteConfirm')}
          </OrganicButton>
        </div>
      </Modal>
    </>
  );
}
