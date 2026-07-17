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
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { wavyVertical } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';
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
  /** Covers the map while keeping it mounted (published-card preview). */
  mapOverlay?: ReactNode;
  children: ReactNode;
}

/**
 * The unified full-viewport workspace: thought map fixed on the left, the
 * draft pane on the right, one wavy pen stroke between them. The stroke is a
 * live handle — dragging it re-balances the two panes (editor capped at 1:1).
 * No app header here; a single Back control sits over the map instead.
 */
export function WorkspaceShell({
  open,
  onClose,
  onOpenCard,
  leftOverride,
  mapOverlay,
  children,
}: WorkspaceShellProps) {
  const t = useTranslations('write');
  const tMap = useTranslations('me.thoughtMap');
  const isMobile = useIsMobile(640);

  const shellRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const { h: railH } = useElementSize(railRef);
  // ~1 turning point per 130px keeps the long rule calm, not noodly.
  const railSteps = Math.max(5, Math.round(railH / 130));

  const [editorFrac, setEditorFrac] = useState(MAX_EDITOR_FRAC);
  const draggingRef = useRef(false);

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
      <div className={styles.mapPane}>
        {leftOverride ?? <ThoughtMapBoard height="100%" flush onOpenCard={onOpenCard} />}
        {mapOverlay}
        <div className={styles.back}>
          <Link href="/me" style={{ textDecoration: 'none' }} title={tMap('back')}>
            <OrganicButton variant="outline" size="sm">
              <span className={styles.backIcon}>
                <Icon
                  name="arrow-right"
                  size={15}
                  ariaLabel={isMobile ? tMap('back') : undefined}
                />
              </span>
              {!isMobile && tMap('back')}
            </OrganicButton>
          </Link>
        </div>
      </div>

      {open && (
        <>
          <div
            ref={railRef}
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
            {railH > 0 && (
              <svg
                className={`${styles.railSvg} res-shape-fade-in`}
                width={14}
                height={railH}
                viewBox={`0 0 14 ${railH}`}
                style={{ width: 14, height: railH }}
                aria-hidden="true"
              >
                <path
                  d={wavyVertical(railH, 83, 5, railSteps)}
                  transform="translate(7,0)"
                  stroke="var(--field-border)"
                  strokeWidth={INK_LIGHT}
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <div className={styles.railGrip} aria-hidden="true" />
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
