'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { useCardSummaries } from '@/lib/data/hooks';
import { useConnectionRefresh, useResonanceRefresh } from '@/lib/data/resonate';
import { deleteCard, unresonate, updateCardSettings } from '@/lib/db/firestore/client/cards';
import type { Visibility } from '@/lib/db/types';
import styles from './CardActionsMenu.module.css';

export interface CardActionsMenuProps {
  /** `referenceCardId`: the card it resonates with, which adds「取消共振」. */
  card: { id: string; visibility: Visibility; slug?: string; referenceCardId?: string };
  /**
   * The title of the card it resonates with, for the confirm's question;
   * looked up from the server when it is asked and this is left out.
   */
  referenceTitle?: string;
  /** Seed so the wobble of the trigger + dropped card is deterministic per card. */
  seed?: number;
  /** The accent hue of the card. If omitted, the menu rides the theme terracotta. */
  hue?: number;
  /** Called after the visibility changed (the card box and the viewer's profile lists are already read again). */
  onChanged?: () => void;
  /** Called after the card was deleted (e.g. navigate away from its detail page). */
  onDeleted?: () => void;
  /** On the page's own paper (the card page's title row): see OrganicMenu's `bare`. */
  bare?: boolean;
  className?: string;
}

type ActionKey = 'edit' | 'visibility' | 'unresonate' | 'delete';

/**
 * The owner-side「⋯」menu on a card: 編輯 / 轉為公開·私人 / 取消共振 (a card
 * that resonates with another) / 刪除. The trigger and
 * dropped panel come from {@link OrganicMenu} (the shared organic dropdown
 * language — wobbly chip, wavy pen dividers, per-row wash, danger wash on the
 * delete row); this component owns only the card business logic. Deleting, and
 * taking a resonance back, ask for confirmation in a {@link Modal} first. Changes go through the server
 * (PATCH / DELETE /api/v1/cards/{id}), which also drops the cached pages that
 * showed the card as it was and keeps the recommender's copy in step; then the
 * viewer's card box and profile lists are read again, so the card visibly
 * moves tabs / disappears without a reload. A change refused (an error, a
 * card the rules won't let go of) says so and leaves the card where it was.
 *
 * Hiding or deleting a card that resonates with another takes the resonance
 * back, and that can end the connection with the original's author: what
 * turns on the viewer's connections is read again too (lib/data/resonate).
 */
export function CardActionsMenu({
  card,
  referenceTitle,
  seed = 7,
  hue,
  onChanged,
  onDeleted,
  bare = false,
  className,
}: CardActionsMenuProps) {
  const t = useTranslations('me.actions');
  const tSafety = useTranslations('safety');
  const router = useRouter();
  const { user } = useAuth();
  const { mutate } = useSWRConfig();

  const refreshResonance = useResonanceRefresh();
  const refreshConnections = useConnectionRefresh();

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'delete' | 'unresonate' | null>(null);
  const [failed, setFailed] = useState(false);
  // A visibility change the server refused: said in a dialog of its own (the menu has closed by then).
  const [visibilityFailed, setVisibilityFailed] = useState(false);

  const original = card.referenceCardId;
  // The confirm asks「不再與〈title〉共振？」: the title is the page's when it
  // has it, else asked for once the question is (the plain words if it can't be read).
  const lookup = useCardSummaries(confirming === 'unresonate' && original && !referenceTitle ? [original] : []);
  const originalTitle =
    referenceTitle ?? (lookup?.status === 'ready' ? lookup.cards.cards.find((c) => c.id === original)?.thoughtCore : undefined);

  const isPrivate = card.visibility === 'private';
  const items: OrganicMenuItem[] = [
    { key: 'edit', icon: 'pen', label: t('edit') },
    {
      key: 'visibility',
      icon: isPrivate ? 'globe' : 'lock',
      label: isPrivate ? t('makePublic') : t('makePrivate'),
    },
    ...(original ? [{ key: 'unresonate', icon: 'wave' as const, label: t('unresonate') }] : []),
    { key: 'delete', icon: 'trash', label: t('delete'), danger: true },
  ];

  // What this browser holds of the viewer's own cards: the card box's shelves, and
  // their profile's lists (profileCards: signed-out reads; profilePage: one
  // per profile they looked at, keyed by viewer). A resonance hidden or deleted
  // was taken back: what turns on their connections is read again in the same pass.
  const refreshOwnLists = useCallback(() => {
    if (!user) return;
    const uid = user.id;
    const own = (key: string) =>
      key.startsWith(`cardbox:${uid}:`) || key === `profileCards:${uid}` || (key.startsWith('profilePage:') && key.endsWith(`:${uid}`));
    if (original) refreshConnections(own);
    else void mutate((key) => typeof key === 'string' && own(key));
  }, [mutate, user, original, refreshConnections]);

  async function choose(key: ActionKey) {
    if (busy) return;
    if (key === 'edit') {
      router.push(`/write/${card.id}`);
      return;
    }
    if (key === 'visibility') {
      setBusy(true);
      setVisibilityFailed(false);
      try {
        await updateCardSettings(card.id, { visibility: isPrivate ? 'public' : 'private' });
        refreshOwnLists();
        onChanged?.();
      } catch {
        setVisibilityFailed(true);
      } finally {
        setBusy(false);
      }
      return;
    }
    // delete / unresonate → confirm first
    setFailed(false);
    setConfirming(key);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await deleteCard(card.id);
      refreshOwnLists();
      setConfirming(null);
      onDeleted?.();
    } catch {
      // Not deleted: the question stays open, saying so, and the card stays in every list.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // The card stays, answering nothing; the server lets go of its link to the
  // original (DELETE /api/v1/cards/{original}/resonances/{id}).
  async function confirmUnresonate() {
    if (busy || !original) return;
    setBusy(true);
    setFailed(false);
    try {
      await unresonate(original, card.id);
      refreshResonance(original, card);
      setConfirming(null);
      onChanged?.();
    } catch {
      setFailed(true);
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
        bare={bare}
        className={className}
      />

      <Modal
        open={confirming === 'delete'}
        onClose={() => (busy ? undefined : setConfirming(null))}
        seed={seed + 5}
        maxWidth={400}
        ariaLabel={t('deleteConfirmTitle')}
      >
        <h3 className={styles.confirmTitle}>{t('deleteConfirmTitle')}</h3>
        <p className={styles.confirmBody}>{t('deleteConfirmBody')}</p>
        {failed && (
          <p className={styles.confirmError} role="alert">
            {tSafety('actionError')}
          </p>
        )}
        {/* Gated via pointer-events while deleting. */}
        <div
          className={styles.confirmActions}
          style={busy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          {/* The modal is the frame: "keep it" is plain text, and deleting — which can't be undone — is red. */}
          <OrganicButton variant="text" size="sm" onClick={() => setConfirming(null)}>
            {t('deleteCancel')}
          </OrganicButton>
          <OrganicButton variant="danger" size="sm" onClick={() => void confirmDelete()}>
            {busy ? '…' : t('deleteConfirm')}
          </OrganicButton>
        </div>
      </Modal>

      <Modal
        open={confirming === 'unresonate'}
        onClose={() => (busy ? undefined : setConfirming(null))}
        seed={seed + 9}
        maxWidth={400}
        ariaLabel={t('unresonate')}
      >
        {/* While its title is on its way the question waits, rather than changing its words under the reader. */}
        <h3 className={styles.confirmTitle} data-pending={lookup?.status === 'loading' || undefined}>
          {originalTitle ? t('unresonateConfirmTitle', { title: originalTitle }) : t('unresonate')}
        </h3>
        <p className={styles.confirmBody}>{t('unresonateConfirmBody')}</p>
        {failed && (
          <p className={styles.confirmError} role="alert">
            {tSafety('actionError')}
          </p>
        )}
        <div
          className={styles.confirmActions}
          style={busy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          {/* The card stays: nothing here is irreversible, so the verb is the plain solid fill. */}
          <OrganicButton variant="text" size="sm" onClick={() => setConfirming(null)}>
            {t('deleteCancel')}
          </OrganicButton>
          <OrganicButton variant="solid" size="sm" onClick={() => void confirmUnresonate()}>
            {busy ? '…' : t('unresonateConfirm')}
          </OrganicButton>
        </div>
      </Modal>

      {/* The menu has closed by the time the server answers: a refusal is said here, and the card stays as it was. */}
      <Modal
        open={visibilityFailed}
        onClose={() => setVisibilityFailed(false)}
        seed={seed + 13}
        maxWidth={400}
        ariaLabel={isPrivate ? t('makePublic') : t('makePrivate')}
        closeButton
      >
        <h3 className={styles.confirmTitle}>{isPrivate ? t('makePublic') : t('makePrivate')}</h3>
        <p className={styles.notice} role="alert">
          {tSafety('actionError')}
        </p>
      </Modal>
    </>
  );
}
