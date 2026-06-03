'use client';

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
  if (headings.length === 0) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className={styles.toc} aria-label={title}>
      <div className={styles.title}>{title}</div>
      <ul className={styles.list}>
        {headings.map((h) => (
          <li key={h.id} data-level={h.level}>
            <button type="button" className={styles.link} onClick={() => scrollTo(h.id)}>
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
