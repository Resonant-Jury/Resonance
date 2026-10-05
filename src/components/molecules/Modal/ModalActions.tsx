'use client';

import type { ReactNode } from 'react';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import styles from './Modal.module.css';

export interface ModalActionsProps {
  /** In scanning order: the way out (tonal) first, the verb (solid / danger) last. */
  children: ReactNode;
  /** A request is on its way: the row dims and takes no pointer. */
  busy?: boolean;
}

/**
 * A dialog's foot when it asks for a choice: right-aligned, the verb
 * rightmost, at every width and as in the apps' ModalActions. A pair too
 * wide for one row (a narrow phone, long English words) stacks rather than
 * squeezing its labels onto two lines inside the pills — the verb on top,
 * the way out under it, both still at the right. Under a coarse pointer each
 * button is at least 44px tall.
 */
export function ModalActions({ children, busy = false }: ModalActionsProps) {
  return (
    <div className={styles.actions} data-busy={busy || undefined}>
      {children}
    </div>
  );
}

export interface ModalCloseRowProps {
  label: string;
  onClose: () => void;
}

/**
 * A dialog's foot when leaving is all there is left to do (a list, a notice,
 * "sent", "thanks", "that didn't go through"): one small tonal Close, centred
 * — what `Modal closeButton` draws, for content that ends inside the modal.
 */
export function ModalCloseRow({ label, onClose }: ModalCloseRowProps) {
  return (
    <div className={styles.closeRow}>
      <OrganicButton variant="tonal" size="sm" onClick={onClose}>
        {label}
      </OrganicButton>
    </div>
  );
}
