'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { Icon } from '@/components/atoms/Icon';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile } from '@/lib/data/hooks';
import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import { createCardLink } from '@/lib/db/firestore/client/cardLinks';
import type { Card } from '@/lib/db/types';
import styles from './LinkCardModal.module.css';
import { INK_STRONG } from '@/lib/design/strokes';

export interface LinkCardModalProps {
  open: boolean;
  onClose: () => void;
  /** The card being linked to (the article being viewed). */
  targetCardId: string;
  /** uid of the target card's author (to notify). */
  targetAuthorId: string;
  onLinked?: () => void;
}

/**
 * Lets the viewer pick one of their own published cards to associate with the
 * card they're viewing ("link with a card"). Replaces the connect-invite action
 * on the card detail page.
 */
export function LinkCardModal({ open, onClose, targetCardId, targetAuthorId, onLinked }: LinkCardModalProps) {
  const t = useTranslations('card');
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setCards(null);
    setSelected(null);
    setDone(false);
    setError(null);
    getCardsByAuthor(user.id, 'published')
      .then((list) => alive && setCards(list.filter((c) => c.id !== targetCardId)))
      .catch(() => alive && setCards([]));
    return () => {
      alive = false;
    };
  }, [open, user, targetCardId]);

  function confirm() {
    if (!selected || !me) return;
    setError(null);
    start(async () => {
      try {
        await createCardLink({
          sourceCardId: selected,
          targetCardId,
          targetAuthorId,
          fromHandle: me.handle,
        });
        setDone(true);
        onLinked?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={480} seed={67} padding="26px 24px 22px" ariaLabel={t('linkModal.title')}>
      {done ? (
        <div className={styles.doneWrap}>
          <Icon name="cards" size={40} color="var(--color-terracotta)" />
          <h3 className={styles.doneTitle}>{t('linkModal.linked')}</h3>
          <OrganicButton variant="outline" size="sm" onClick={onClose}>
            {t('linkModal.close')}
          </OrganicButton>
        </div>
      ) : (
        <>
          <h3 className={styles.title}>{t('linkModal.title')}</h3>
          <p className={styles.subtitle}>{t('linkModal.pickCard')}</p>

          {cards === null ? (
            <p className={styles.muted}>…</p>
          ) : cards.length === 0 ? (
            <p className={styles.muted}>{t('linkModal.noCards')}</p>
          ) : (
            <ul className={styles.list}>
              {cards.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={styles.cardRow}
                    data-selected={selected === c.id || undefined}
                    onClick={() => setSelected(c.id)}
                  >
                    <span className={styles.thumb}>
                      <OrganicImage src={c.media?.url} alt={c.thoughtCore} seed={i * 7 + 3} ratio={1}>
                        {!c.media?.url && (
                          <span className={styles.thumbFallback} style={{ background: `oklch(90% 0.06 ${(c.accentHue ?? 55)})` }} />
                        )}
                      </OrganicImage>
                    </span>
                    <span className={styles.cardTitle}>{c.thoughtCore}</span>
                    {selected === c.id && (
                      <Icon name="check" size={18} strokeWidth={INK_STRONG} color="var(--color-terracotta)" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <OrganicButton variant="ghost" size="sm" onClick={onClose}>
              {t('linkModal.cancel')}
            </OrganicButton>
            <div style={{ opacity: selected && !pending ? 1 : 0.5, pointerEvents: selected && !pending ? 'auto' : 'none' }}>
              <OrganicButton variant="primary" size="sm" onClick={confirm}>
                {pending ? '…' : t('linkModal.confirm')}
              </OrganicButton>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
