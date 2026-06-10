'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import type { Card } from '@/lib/db/types';
import styles from './InsertCardModal.module.css';

export interface InsertCardModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen card; the caller inserts the link and closes. */
  onPick: (card: Card) => void;
}

/**
 * Picker for the editor's "insert card link" action: lists the author's own
 * published public cards; clicking one inserts a markdown link at the cursor.
 * Public-only because the link lands in a story any reader may open.
 */
export function InsertCardModal({ open, onClose, onPick }: InsertCardModalProps) {
  const t = useTranslations('write.editor.cardModal');
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setCards(null);
    getCardsByAuthor(user.id, 'published')
      .then((list) => alive && setCards(list.filter((c) => c.visibility === 'public')))
      .catch(() => alive && setCards([]));
    return () => {
      alive = false;
    };
  }, [open, user]);

  return (
    <Modal open={open} onClose={onClose} maxWidth={480} seed={53} padding="26px 24px 22px" ariaLabel={t('title')}>
      <h3 className={styles.title}>{t('title')}</h3>
      <p className={styles.subtitle}>{t('subtitle')}</p>

      {cards === null ? (
        <p className={styles.muted}>…</p>
      ) : cards.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <ul className={styles.list}>
          {cards.map((c, i) => (
            <li key={c.id}>
              <button type="button" className={styles.cardRow} onClick={() => onPick(c)}>
                <span className={styles.thumb}>
                  <OrganicImage src={c.media?.url} alt={c.thoughtCore} seed={i * 7 + 3} ratio={1}>
                    {!c.media?.url && (
                      <span
                        className={styles.thumbFallback}
                        style={{ background: `oklch(90% 0.06 ${c.accentHue ?? 55})` }}
                      />
                    )}
                  </OrganicImage>
                </span>
                <span className={styles.cardTitle}>{c.thoughtCore}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <OrganicButton variant="ghost" onClick={onClose}>
          {t('cancel')}
        </OrganicButton>
      </div>
    </Modal>
  );
}
