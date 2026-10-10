import { useMemo, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { avatarWobPath } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { INK } from '@/lib/design/strokes';
import styles from './EmptyState.module.css';

/** The mark's blob: an avatar's outline at this size (HandDrawnAvatar's recipe). */
const MARK = 64;

export interface EmptyStateProps {
  /** The glyph in the mark; without it, no mark (a not-found or error state). */
  icon?: IconName;
  /** The mark's wobble. */
  seed?: number;
  /** One line in the heading face. */
  title?: ReactNode;
  /** The quiet line under it (or alone). */
  line?: ReactNode;
  /** A small button under the words. */
  action?: ReactNode;
  /**
   * Take all the height the region gives (a pane, a page's body) and sit a
   * little above its middle. Without it the state stands in 300px of its own
   * (inside a list or a dialog, which can't give it a height).
   */
  fills?: boolean;
  /** The title's element: a heading on a page; plain words inside a dialog, which has its own. */
  titleAs?: 'h2' | 'h3' | 'p';
  className?: string;
}

/**
 * What a list says when it has nothing to show — the same on every page and
 * every platform (design note §1): centred in its region, a small organic
 * blob with a glyph, a title and one quiet line, and an action if there is one.
 */
export function EmptyState({ icon, seed = 23, title, line, action, fills = false, titleAs = 'h2', className }: EmptyStateProps) {
  const Title = titleAs;
  return (
    <div className={`${styles.root} ${className ?? ''}`} data-fills={fills || undefined}>
      <span className={styles.above} aria-hidden />
      <div className={styles.column}>
        {icon && <EmptyMark icon={icon} seed={seed} />}
        {title && <Title className={styles.title} data-after-mark={icon ? '' : undefined}>{title}</Title>}
        {line && (
          <p className={styles.line} data-after={title ? 'title' : icon ? 'mark' : undefined}>
            {line}
          </p>
        )}
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <span className={styles.below} aria-hidden />
    </div>
  );
}

function EmptyMark({ icon, seed }: { icon: IconName; seed: number }) {
  const d = useMemo(() => avatarWobPath(MARK, seed), [seed]);
  return (
    <span className={styles.mark} aria-hidden>
      <svg width={MARK} height={MARK} viewBox={`0 0 ${MARK} ${MARK}`} className={styles.blob}>
        <path d={d} fill="color-mix(in oklch, var(--color-terracotta-light) 50%, transparent)" />
      </svg>
      <ShapeGrain w={MARK} h={MARK} d={d} opacity={0.3} frequency={0.88} seed={seed} />
      <Icon name={icon} size={28} strokeWidth={INK} color="var(--button-on-tonal)" className={styles.glyph} />
    </span>
  );
}
