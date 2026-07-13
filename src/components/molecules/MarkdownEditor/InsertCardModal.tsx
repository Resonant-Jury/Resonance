'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { OrganicScrollbar } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import type { Card } from '@/lib/db/types';
import styles from './InsertCardModal.module.css';

export interface InsertCardModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen card; the caller inserts the link and closes. */
  onPick: (card: Card) => void;
  /** Override the heading (e.g. the DM「分享卡片」context vs. editor insert). */
  title?: string;
  /** Override the subtitle line. */
  subtitle?: string;
}

/**
 * Picker for the author's own published public cards. Used both by the editor's
 * "insert card link" action and by the DM composer's "share a card" — the
 * caller supplies the copy and decides what to do with the pick. Public-only
 * because the reference lands somewhere the recipient can open.
 */
export function InsertCardModal({ open, onClose, onPick, title, subtitle }: InsertCardModalProps) {
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

  const heading = title ?? t('title');

  return (
    <Modal open={open} onClose={onClose} maxWidth={480} seed={53} padding="26px 24px 22px" ariaLabel={heading}>
      <h3 className={styles.title}>{heading}</h3>
      <p className={styles.subtitle}>{subtitle ?? t('subtitle')}</p>

      {cards === null ? (
        <p className={styles.muted}>…</p>
      ) : cards.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <CardRowList cards={cards} onPick={onPick} />
      )}

      <div className={styles.actions}>
        <OrganicButton variant="ghost" size="sm" onClick={onClose}>
          {t('cancel')}
        </OrganicButton>
      </div>
    </Modal>
  );
}

/**
 * The scrollable pick list: rows part with a wavy pen rule (the notification
 * modal's language) — no boxed hover region; hover speaks through the ink.
 */
function CardRowList({ cards, onPick }: { cards: Card[]; onPick: (card: Card) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.listArea}>
      <div ref={scrollRef} className={styles.scroll}>
        <ul className={styles.list}>
          {cards.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && (
                <li aria-hidden>
                  <Divider seed={67 + i * 31} spacing={0} />
                </li>
              )}
              <li>
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
            </Fragment>
          ))}
        </ul>
      </div>
      <OrganicScrollbar targetRef={scrollRef} seed={61} />
    </div>
  );
}
