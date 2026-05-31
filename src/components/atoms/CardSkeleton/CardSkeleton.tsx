import styles from './CardSkeleton.module.css';

/** A single shimmering placeholder card. */
export function CardSkeleton() {
  return (
    <div className={styles.card} aria-hidden>
      <div className={`${styles.line} ${styles.title}`} />
      <div className={styles.line} />
      <div className={styles.line} />
      <div className={`${styles.line} ${styles.short}`} />
      <div>
        <span className={styles.tag} />
        <span className={styles.tag} />
      </div>
    </div>
  );
}

/** A grid of skeleton cards matching CardLinkGrid's column layout. */
export function FeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.grid} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.item}>
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}
