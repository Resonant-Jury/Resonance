'use client';

import type { ReactNode } from 'react';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import modalStyles from '@/components/molecules/Modal/Modal.module.css';
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
  /** Action in flight: the verb shows it is working, the way out rests and the dialog can't be dismissed. */
  busy?: boolean;
  /** A permanent loss (delete a card, a conversation, the account): the verb in red. */
  destructive?: boolean;
  /** Why the last try didn't go through, said right above the buttons (the dialog stays to try again). */
  error?: string | null;
  /**
   * The title's words are still on their way (they name something being
   * read): its line keeps its place, empty, rather than changing its words
   * under the reader.
   */
  titlePending?: boolean;
  seed?: number;
}

/**
 * The one confirm-dialog layout for the whole app (sign out, delete a card,
 * leave the writer, block, …): left-aligned title + body like any reading
 * surface, then `ModalActions` — right-aligned, cancel then the verb, the
 * verb rightmost. The modal is the frame, so neither button draws one: cancel
 * is the tonal pill, the verb a solid fill — red when it can't be undone
 * (`destructive`), as in the apps' confirm dialogs. Keeping every confirm on
 * this single component is what stops the layouts from drifting apart again.
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
  error,
  titlePending = false,
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
      <h3 className={styles.title} data-pending={titlePending || undefined}>
        {title}
      </h3>
      <p className={styles.body}>{body}</p>
      {error && (
        <p className={modalStyles.error} role="alert">
          {error}
        </p>
      )}
      <ModalActions busy={busy}>
        <OrganicButton variant="tonal" size="sm" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </OrganicButton>
        <OrganicButton variant={destructive ? 'danger' : 'solid'} size="sm" onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </OrganicButton>
      </ModalActions>
    </Modal>
  );
}
