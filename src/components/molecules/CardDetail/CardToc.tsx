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

// Curve depth + stroke weight of the hand-drawn rule down the left of the list.
const AMP = 5;
const SW = 3;

/**
 * Table of Contents for the card reading page. Headings are extracted from the
 * rendered story (so the `id`s match rehype-slug exactly); clicking one
 * smooth-scrolls the article to that section.
 */
export function CardToc({ headings, title }: { headings: TocHeading[]; title: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const { h: listH } = useElementSize(listRef);

  // A pronounced wavy rule — the organic sibling of a flat 1px border. Step
  // count scales with height so the curve stays evenly spaced over long lists.
  const linePath = useMemo(
    () => (listH > 0 ? wavyVertical(listH, 9, AMP, Math.max(5, Math.round(listH / 32))) : ''),
    [listH],
  );

  const railW = AMP * 2 + SW + 2;

  if (headings.length === 0) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className={styles.toc} aria-label={title}>
      <div className={styles.title}>{title}</div>
      <div className={styles.listWrap}>
        <div className={styles.rail} style={{ width: railW }}>
          {listH > 0 && (
            <svg
              className="res-shape-fade-in"
              width={railW}
              height={listH}
              viewBox={`${-railW / 2} 0 ${railW} ${listH}`}
              preserveAspectRatio="none"
              aria-hidden
              style={{ display: 'block', overflow: 'visible' }}
            >
              <path
                d={linePath}
                fill="none"
                stroke="var(--field-border)"
                strokeWidth={SW}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>
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
