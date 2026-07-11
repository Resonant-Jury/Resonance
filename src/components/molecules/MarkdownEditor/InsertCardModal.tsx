'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { OrganicScrollbar } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import { dividerPath, rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { INK_LIGHT } from '@/lib/design/strokes';
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

// Wavy-divider geometry shared by the row fills and the stroked rules — the
// same rowMenu language as Subnavbar / Select, so the hover wash floods the
// curve-bounded row region instead of a flat rounded rectangle.
const SEED = 67;
const DIVIDER_AMP = 3;
const PAD = 12;

function CardRowList({ cards, onPick }: { cards: Card[]; onPick: (card: Card) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [rows, setRows] = useState<{ top: number; height: number }[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const recompute = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setDims({ w: wrap.offsetWidth, h: wrap.offsetHeight });
    setRows(
      rowRefs.current
        .slice(0, cards.length)
        .map((el) => (el ? { top: el.offsetTop, height: el.offsetHeight } : { top: 0, height: 0 })),
    );
  }, [cards.length]);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [recompute]);

  const boundaries = useMemo<[number, number][][]>(() => {
    if (!dims.w || rows.length < 2) return [];
    return rows.slice(1).map((r, i) => {
      const prev = rows[i];
      const y = (prev.top + prev.height + r.top) / 2;
      return rowBoundary(y, dims.w, SEED + i * 31 + 7, DIVIDER_AMP, PAD);
    });
  }, [dims.w, rows]);

  const ready = dims.w > 0 && dims.h > 0 && rows.length === cards.length && boundaries.length === cards.length - 1;

  return (
    <div className={styles.listArea}>
      <div ref={scrollRef} className={styles.scroll}>
        <div ref={wrapRef} className={styles.listWrap}>
          {ready && (
            <svg
              className={styles.washSvg}
              width={dims.w}
              height={dims.h}
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              aria-hidden
            >
              {/* Plain fade per row — the rows aren't curve-bounded on all
                  four sides, so the pointer-anchored bloom reveal read oddly
                  here. */}
              {cards.map((c, i) => (
                <path
                  key={c.id}
                  d={rowRegion(i, cards.length, boundaries, dims.w, dims.h, PAD)}
                  fill="color-mix(in oklch, var(--color-terracotta) 13%, transparent)"
                  opacity={hovered === i ? 1 : 0}
                  style={{ transition: 'opacity 180ms ease' }}
                />
              ))}
              {boundaries.map((pts, i) => (
                <path
                  key={i}
                  d={dividerPath(pts)}
                  fill="none"
                  stroke="oklch(60% 0.04 60 / 0.45)"
                  strokeWidth={INK_LIGHT}
                  strokeLinecap="round"
                />
              ))}
            </svg>
          )}
          <ul className={styles.list}>
            {cards.map((c, i) => (
              <li
                key={c.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
              >
                <button
                  type="button"
                  className={styles.cardRow}
                  onClick={() => onPick(c)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((cur) => (cur === i ? null : cur))}
                >
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
        </div>
      </div>
      <OrganicScrollbar targetRef={scrollRef} seed={61} />
    </div>
  );
}
