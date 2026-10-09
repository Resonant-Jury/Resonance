'use client';

import { Fragment, useId, useMemo, useRef, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
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
 * under it — when it came out, led by 匿名 for an anonymous card. Rows are
 * parted by a wavy pen rule (the notification modal's language) — no boxed
 * hover region; hover speaks through the ink. As a choice, the chosen row's
 * thumb takes a terracotta wash with a tick and its title the accent, so the
 * pick reads before it is confirmed.
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
                <Fragment key={c.id}>
                  {i > 0 && (
                    <li aria-hidden role={choosing ? 'none' : undefined}>
                      <Divider seed={67 + i * 31} spacing={0} />
                    </li>
                  )}
                  <li role={choosing ? 'none' : undefined}>
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
                      <span className={styles.thumb}>
                        <OrganicImage src={c.media?.url} alt="" seed={i * 7 + 3} ratio={1}>
                          {!c.media?.url && (
                            <span
                              className={styles.thumbFallback}
                              style={{ background: `oklch(90% 0.06 ${c.accentHue ?? 55})` }}
                            />
                          )}
                          {chosen && (
                            <span className={styles.thumbChosen} aria-hidden>
                              <Icon name="check" size={20} color="var(--color-cream)" />
                            </span>
                          )}
                        </OrganicImage>
                      </span>
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
                </Fragment>
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
