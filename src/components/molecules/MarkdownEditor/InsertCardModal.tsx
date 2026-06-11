'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
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
        <CardRowList cards={cards} onPick={onPick} />
      )}

      <div className={styles.actions}>
        <OrganicButton variant="ghost" onClick={onClose}>
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
  const uid = useId().replace(/:/g, '');

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [rows, setRows] = useState<{ top: number; height: number }[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

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

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const hoverMaxR =
    Math.hypot(Math.max(pos.x, dims.w - pos.x), Math.max(pos.y, dims.h - pos.y)) + 4;

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
              <defs>
                {/* one pointer-anchored reveal circle per row, so the wash
                    grows from the cursor and shrinks back independently */}
                {cards.map((c, i) => (
                  <mask
                    key={c.id}
                    id={`icm-hover-${uid}-${i}`}
                    maskUnits="userSpaceOnUse"
                    x={-dims.w}
                    y={-dims.h}
                    width={dims.w * 3}
                    height={dims.h * 3}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={hovered === i ? hoverMaxR : 0}
                      fill="white"
                      style={{ transition: 'r 340ms linear' }}
                    />
                  </mask>
                ))}
              </defs>
              {cards.map((c, i) => (
                <g key={c.id} mask={`url(#icm-hover-${uid}-${i})`}>
                  <path
                    d={rowRegion(i, cards.length, boundaries, dims.w, dims.h, PAD)}
                    fill="color-mix(in oklch, var(--color-terracotta) 13%, transparent)"
                  />
                </g>
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
                  onMouseEnter={(e) => {
                    recordPointer(e);
                    setHovered(i);
                  }}
                  onMouseMove={recordPointer}
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
