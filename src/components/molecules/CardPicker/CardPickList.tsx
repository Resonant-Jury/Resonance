'use client';

import { useId, useMemo, useRef, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { wobRect } from '@/lib/design/wobRect';
import { INK } from '@/lib/design/strokes';
import type { Card } from '@/lib/db/types';
import styles from './CardPickList.module.css';

export interface CardPickListProps {
  cards: Card[];
  /** A tapped row: the pick itself, or — with `selectedId` — the row to mark. */
  onPick: (card: Card) => void;
  /**
   * What comes before the cards and scrolls with them (the resonate picker's
   * "write a new card" row and the caption over the cards).
   */
  lead?: ReactNode;
  /**
   * Makes the rows one choice (radio buttons): the row with this id is
   * marked, `null` none yet. Left out, a tap is the pick (the editor's
   * "insert a card link", the thread's "share a card").
   */
  selectedId?: string | null;
  /** The choice's name for a screen reader (with `selectedId`). */
  label?: string;
  /** No row can be pressed (a request is on its way). */
  disabled?: boolean;
  /** Leads an anonymous card's meta line (「匿名 · 9月28日」); without it nothing marks one. */
  anonymousLabel?: string;
  /** Drawn in place of the rows when there are no cards; without it, no cards draw nothing (no empty list). */
  empty?: ReactNode;
  /** A quiet line under the rows (why some cards are not listed). */
  footnote?: ReactNode;
}

/**
 * When a card came out, for its row: the month and day this year, with the
 * year before that (「9月28日」/ "Sep 28", 「2025年9月28日」/ "Sep 28, 2025").
 */
export function pickDate(locale: string): (d: Date) => string {
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  return (d) => (d.getFullYear() === new Date().getFullYear() ? day : year).format(d);
}

/**
 * The author's own cards as a scrollable pick list, quiet enough to scan: on
 * each row a 40px cover thumb, the title on one line, and one muted line
 * under it — when it came out, led by 匿名 for an anonymous card. The rows
 * stand in one group with no rule between them (a single wavy rule parts the
 * group from what leads it) — no boxed hover region; hover speaks through
 * the ink. The thumb is an avatar's kind of shape at a smaller radius. As a
 * choice, the chosen row's thumb takes a terracotta wash with the buttons'
 * grain and a tick, and its title the deep accent, so the pick reads before
 * it is confirmed.
 */
export function CardPickList({
  cards,
  onPick,
  lead,
  selectedId,
  label,
  disabled = false,
  anonymousLabel,
  empty,
  footnote,
}: CardPickListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const choosing = selectedId !== undefined;
  const locale = useLocale();
  const dateOf = useMemo(() => pickDate(locale), [locale]);
  // A row is named by its title and described by its meta line, so neither runs into the other.
  const ids = useId();

  return (
    <div className={styles.listArea}>
      <div ref={scrollRef} className={`${styles.scroll} ${organicScrollTarget}`}>
        {lead}
        {cards.length === 0 ? (
          empty ? (
            <div className={styles.empty}>{empty}</div>
          ) : null
        ) : (
          <ul
            className={styles.list}
            role={choosing ? 'radiogroup' : undefined}
            aria-label={choosing ? label : undefined}
            aria-disabled={choosing && disabled ? true : undefined}
          >
            {cards.map((c, i) => {
              const chosen = choosing && c.id === selectedId;
              const meta = [c.anonymous && anonymousLabel, c.publishedAt && dateOf(c.publishedAt)]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={c.id} role={choosing ? 'none' : undefined}>
                  <button
                    type="button"
                    className={styles.cardRow}
                    role={choosing ? 'radio' : undefined}
                    aria-checked={choosing ? chosen : undefined}
                    data-chosen={chosen || undefined}
                    disabled={disabled}
                    onClick={() => onPick(c)}
                    aria-labelledby={`${ids}-${i}-title`}
                    aria-describedby={meta ? `${ids}-${i}-meta` : undefined}
                  >
                    <PickThumb src={c.media?.url} hue={c.accentHue ?? 55} seed={i * 7 + 3} chosen={chosen} />
                    <span className={styles.rowText}>
                      <span id={`${ids}-${i}-title`} className={styles.cardTitle}>
                        {c.thoughtCore}
                      </span>
                      {meta && (
                        <span id={`${ids}-${i}-meta`} className={styles.meta}>
                          {meta}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {footnote && <p className={styles.footnote}>{footnote}</p>}
      </div>
      <OrganicScrollbar targetRef={scrollRef} seed={61} />
    </div>
  );
}

/** The thumb's size, and its outline: HandDrawnAvatar's recipe at a quarter of the size for a radius. */
const THUMB = 40;

/** A pick row's cover thumb, in an avatar's hand-drawn outline (design note §6). */
export function thumbPath(seed: number): string {
  return wobRect(THUMB, THUMB, THUMB * 0.25, seed, THUMB * 0.022, {
    segmentsH: 1,
    segmentsV: 1,
    curve: 1.3,
    cornerJitter: 3.2,
    cornerOffset: THUMB * 0.06,
  });
}

function PickThumb({ src, hue, seed, chosen }: { src?: string; hue: number; seed: number; chosen: boolean }) {
  const d = useMemo(() => thumbPath(seed), [seed]);
  const clip = `path('${d}')`;
  return (
    <span className={styles.thumb} data-thumb>
      <span className={styles.thumbFace} style={{ clipPath: clip }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={THUMB} height={THUMB} loading="lazy" decoding="async" className={styles.thumbImg} />
        ) : (
          <span className={styles.thumbFallback} style={{ background: `oklch(90% 0.06 ${hue})` }} />
        )}
        {chosen && <span className={styles.thumbChosen} aria-hidden />}
      </span>
      {chosen && <ShapeGrain w={THUMB} h={THUMB} d={d} opacity={0.38} frequency={1.1} seed={seed} zIndex={1} />}
      <svg width={THUMB} height={THUMB} viewBox={`0 0 ${THUMB} ${THUMB}`} className={styles.thumbPen} aria-hidden>
        <path d={d} fill="none" stroke="oklch(36% 0.06 60 / 0.55)" strokeWidth={INK} strokeLinejoin="round" />
      </svg>
      {chosen && (
        <span className={styles.thumbTick} aria-hidden>
          <Icon name="check" size={20} color="var(--color-cream)" />
        </span>
      )}
    </span>
  );
}
