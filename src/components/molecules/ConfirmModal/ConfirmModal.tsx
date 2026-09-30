'use client';

import type { ReactNode } from 'react';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import styles from './ConfirmModal.module.css';

export interface ConfirmModalProps {
  open: boolean;
  /** Dialog heading — also the aria-label. */
  title: string;
  body: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Action in flight — dims the buttons and blocks dismissal. */
  busy?: boolean;
  /** A permanent loss (delete a card, a conversation, the account): the verb in red. */
  destructive?: boolean;
  seed?: number;
}

/**
 * The one confirm-dialog layout for the whole app (sign out, discard draft, …):
 * left-aligned title + body like any reading surface, actions bottom-right in
 * scanning order (cancel, then the verb), standard Modal padding. The modal is
 * the frame, so neither button draws one: cancel is plain text, the verb a
 * solid fill — red when it can't be undone (`destructive`), as in the apps'
 * confirm dialogs. Keeping every confirm on this single component is what
 * stops the layouts from drifting apart again.
 */
export function ConfirmModal({
  open,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  destructive = false,
  seed = 67,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth={400}
      seed={seed}
      ariaLabel={title}
    >
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions} data-busy={busy || undefined}>
        <OrganicButton variant="text" size="sm" onClick={onCancel}>
          {cancelLabel}
        </OrganicButton>
        <OrganicButton variant={destructive ? 'danger' : 'solid'} size="sm" onClick={onConfirm}>
          {busy ? '…' : confirmLabel}
        </OrganicButton>
      </div>
    </Modal>
  );
}
