'use client';

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { Link } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

/* The editor pane may shrink to a comfortable reading column and grow at most
   to a 1:1 split — the map keeps at least half the screen or it stops being a
   map (desktop; below 1200px the pane simply covers the viewport). */
const MIN_EDITOR_FRAC = 0.32;
const MAX_EDITOR_FRAC = 0.5;

export interface WorkspaceShellProps {
  /** Whether the right (editor) pane is open; closed = full-bleed map. */
  open: boolean;
  onClose: () => void;
  /** Host override for the map's「開啟卡片」. */
  onOpenCard?: (card: Card) => void;
  /** Replaces the map entirely (resonance writing shows the original card). */
  leftOverride?: ReactNode;
  /** Where Back leads; defaults to the profile page. Hosts entered from a
   * card page point it back at that card instead. */
  back?: { href: string; label: string };
  children: ReactNode;
}

/**
 * The unified full-viewport workspace: thought map fixed on the left, the
 * draft pane on the right. The boundary is the pane's own straight edge; a
 * small grip riding on it is the resize handle (editor capped at 1:1). No app
 * header here; a single Back control sits over the map instead.
 */
export function WorkspaceShell({
  open,
  onClose,
  onOpenCard,
  leftOverride,
  back,
  children,
}: WorkspaceShellProps) {
  const t = useTranslations('write');
  const tMap = useTranslations('me.thoughtMap');
  const isMobile = useIsMobile(640);

  const shellRef = useRef<HTMLDivElement>(null);
  const [editorFrac, setEditorFrac] = useState(MAX_EDITOR_FRAC);
  const draggingRef = useRef(false);

  const backHref = back?.href ?? '/me';
  const backLabel = back?.label ?? tMap('back');

  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onRailPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const r = shellRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const f = (r.right - e.clientX) / r.width;
    setEditorFrac(Math.min(MAX_EDITOR_FRAC, Math.max(MIN_EDITOR_FRAC, f)));
  };
  const onRailPointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      style={{ '--editor-frac': editorFrac } as CSSProperties}
    >
      <div className={leftOverride ? `${styles.mapPane} ${styles.mapPaneDoc}` : styles.mapPane}>
        {leftOverride ?? <ThoughtMapBoard height="100%" flush onOpenCard={onOpenCard} />}
        <div className={styles.back}>
          <Link href={backHref} style={{ textDecoration: 'none' }} title={backLabel}>
            <OrganicButton variant="outline" size="sm">
              <span className={styles.backIcon}>
                <Icon
                  name="arrow-right"
                  size={15}
                  ariaLabel={isMobile ? backLabel : undefined}
                />
              </span>
              {!isMobile && backLabel}
            </OrganicButton>
          </Link>
        </div>
      </div>

      {open && (
        <>
          <div
            className={styles.rail}
            role="separator"
            aria-orientation="vertical"
            aria-label={t('resizeDivider')}
            title={t('resizeDivider')}
            onPointerDown={onRailPointerDown}
            onPointerMove={onRailPointerMove}
            onPointerUp={onRailPointerUp}
            onPointerCancel={onRailPointerUp}
          >
            <div className={styles.railGrip} aria-hidden="true">
              <span className={styles.railGripIcon}>
                <Icon name="dots" size={15} />
              </span>
            </div>
          </div>

          <section className={styles.editorPane}>
            <div className={styles.paneScroll}>{children}</div>
            <button
              type="button"
              className={styles.paneClose}
              aria-label={t('closeEditor')}
              title={t('closeEditor')}
              onClick={onClose}
            >
              <Icon name="close" size={17} />
            </button>
          </section>
        </>
      )}
    </div>
  );
}
