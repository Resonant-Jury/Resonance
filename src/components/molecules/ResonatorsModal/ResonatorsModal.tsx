'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Divider } from '@/components/atoms/Divider/Divider';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import type { User } from '@/lib/db/types';
import styles from './ResonatorsModal.module.css';

export interface ResonatorsModalProps {
  open: boolean;
  onClose: () => void;
  resonators: User[];
}

/**
 * Lists everyone who resonated with a card. Each row: hand-drawn avatar on the
 * left, name + bio on the right. Author-only surface (opened from the resonator
 * avatar group).
 */
export function ResonatorsModal({ open, onClose, resonators }: ResonatorsModalProps) {
  const t = useTranslations('card');

  return (
    <Modal open={open} onClose={onClose} maxWidth={440} seed={61} padding="26px 24px 22px" ariaLabel={t('resonatorsModal.title')}>
      <h3 className={styles.title}>{t('resonatorsModal.title')}</h3>
      {resonators.length === 0 ? (
        <p className={styles.empty}>{t('noResonatorsYet')}</p>
      ) : (
        <ul className={styles.list}>
          {resonators.map((u, i) => (
            <Fragment key={u.id}>
              {i > 0 && <Divider seed={i * 13 + 5} spacing={4} />}
              <li className={styles.row}>
                <HandDrawnAvatar
                  initials={u.initials}
                  size={42}
                  color={u.accentColor}
                  seed={Number(u.avatarSeed) || i + 1}
                />
                <div className={styles.meta}>
                  <div className={styles.name}>@{u.handle}</div>
                  <div className={styles.bio}>{u.bio || t('noBio')}</div>
                </div>
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </Modal>
  );
}
