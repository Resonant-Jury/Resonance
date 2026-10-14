'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wavyVertical } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { INK_LIGHT } from '@/lib/design/strokes';
import styles from './CardToc.module.css';

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

// Curve depth + stroke weight of the hand-drawn rule down the left of the list.
const AMP = 5;
const SW = INK_LIGHT;

/**
 * Table of Contents for the card reading page. Headings are extracted from the
 * rendered story (so the `id`s match rehype-slug exactly); clicking one
 * smooth-scrolls the article to that section.
 *
 * The rail it sits in never runs past the window (page.module.css `.aside`), so
 * a story with many headings scrolls its list in place: the wheel over it moves
 * the list, not the page, and the edge it can still move toward fades out.
 */
export function CardToc({ headings, title }: { headings: TocHeading[]; title: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { h: listH } = useElementSize(listRef);
  const [more, setMore] = useState<{ above: boolean; below: boolean }>({ above: false, below: false });

  const measureMore = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const above = el.scrollTop > 1;
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setMore((m) => (m.above === above && m.below === below ? m : { above, below }));
  }, []);

  // The list's own height changes it, and so does the window's (the rail's cap follows it).
  useEffect(() => {
    measureMore();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureMore);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureMore, listH]);

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
      <div
        ref={scrollRef}
        className={styles.listWrap}
        onScroll={measureMore}
        data-more-above={more.above || undefined}
        data-more-below={more.below || undefined}
      >
        <div className={styles.rail} style={{ width: `${railW}px`, height: `${listH}px` }}>
          {listH > 0 && (
            <svg
              className="res-shape-fade-in"
              width={railW}
              height={listH}
              viewBox={`${-railW / 2} 0 ${railW} ${listH}`}
              preserveAspectRatio="none"
              aria-hidden
              style={{ display: 'block', overflow: 'visible', width: `${railW}px`, height: `${listH}px` }}
            >
              <path
                d={linePath}
                fill="none"
                stroke="var(--field-border)"
                strokeWidth={SW}
                strokeLinecap="round"
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
