'use client';

import { useMemo, useRef } from 'react';
import { wavyVertical } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './CardToc.module.css';

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Table of Contents for the card reading page. Headings are extracted from the
 * rendered story (so the `id`s match rehype-slug exactly); clicking one
 * smooth-scrolls the article to that section.
 */
export function CardToc({ headings, title }: { headings: TocHeading[]; title: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const { h: listH } = useElementSize(listRef);

  // Wavy hand-drawn rule running down the left of the list — the organic
  // sibling of a flat 1px border. A higher step count keeps the curve gentle
  // over tall lists; amplitude stays small so it reads as a guide, not noise.
  const linePath = useMemo(
    () => (listH > 0 ? wavyVertical(listH, 7, 2.2, Math.max(4, Math.round(listH / 36))) : ''),
    [listH],
  );

  if (headings.length === 0) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className={styles.toc} aria-label={title}>
      <div className={styles.title}>{title}</div>
      <div className={styles.listWrap}>
        {listH > 0 && (
          <svg
            className={`${styles.rule} res-shape-fade-in`}
            width={6}
            height={listH}
            viewBox={`-3 0 6 ${listH}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d={linePath}
              fill="none"
              stroke="var(--field-border)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        )}
        <ul className={styles.list} ref={listRef}>
          {headings.map((h) => (
            <li key={h.id} data-level={h.level}>
              <button type="button" className={styles.link} onClick={() => scrollTo(h.id)}>
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
