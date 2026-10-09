'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { HeaderBar } from '@/components/sections/AppHeader/HeaderBar';
import { HEADER_STROKE_Y, HEADER_TOTAL_H } from '@/components/sections/AppHeader/HeaderChrome';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import { PaneHeader } from './PaneHeader';
import styles from './WriteWorkspace.module.css';

/* The editor pane may shrink to a comfortable reading column and grow at most
   to a 1:1 split — the map keeps at least half the screen or it stops being a
   map (desktop; below 1200px the pane simply covers the viewport). */
const MIN_EDITOR_FRAC = 0.32;
const MAX_EDITOR_FRAC = 0.5;

export interface WorkspaceShellProps {
  /** Whether the right (editor) pane is open; closed = full-bleed map. */
  open: boolean;
  /**
   * Hides the pane (the thought-map page; the writer's bar has the way back
   * instead): the pane's header row carries the control, and Escape does it.
   */
  onClose?: () => void;
  /** What the pane shows, named in its header row (with `onClose` and no `bar`). */
  paneTitle?: ReactNode;
  /** Host override for the map's「開啟卡片」. */
  onOpenCard?: (card: Card) => void;
  /** Replaces the map entirely (resonance writing shows the original card). */
  leftOverride?: ReactNode;
  /**
   * The writer's bar, as on the apps' writer page: the back arrow and the
   * title of what the pane shows, in the app header's likeness across both
   * panes, what scrolls passing under its pen line. It takes the place of
   * the Leave floating over the map and of the pane's own header row.
   */
  bar?: { title: ReactNode; onBack: () => void };
  children: ReactNode;
}

/**
 * The unified full-viewport workspace: thought map fixed on the left, the
 * draft pane on the right. The boundary is the pane's own straight edge; a
 * small grip riding on it is the resize handle (editor capped at 1:1). No app
 * header here: the writer stands its own bar over both panes (`bar`); the
 * thought-map page has a single Back control over the map instead.
 */
export function WorkspaceShell({
  open,
  onClose,
  paneTitle,
  onOpenCard,
  leftOverride,
  bar,
  children,
}: WorkspaceShellProps) {
  const t = useTranslations('write');
  const tMap = useTranslations('me.thoughtMap');
  const tNav = useTranslations('app.nav');
  const isMobile = useIsMobile(640);
  const router = useRouter();
  // Below the desktop split (the module CSS's 1200px) the open pane covers
  // the map: there it mounts — reading the map and every card on it — only
  // once it is shown, and then stays (a card opened from it returns to it).
  // Unknown until hydrated, so a phone never mounts it in passing.
  const split = useMediaQuery('(min-width: 1200px)');
  const mapShown = useRef(false);
  if (!leftOverride && (!open || split === true)) mapShown.current = true;

  const shellRef = useRef<HTMLDivElement>(null);
  const [editorFrac, setEditorFrac] = useState(MAX_EDITOR_FRAC);
  const draggingRef = useRef(false);

  const leaveLabel = tMap('leave');

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

  // The bar's pen line inks in whole while anything under it has scrolled
  // (the draft, or the original card beside it).
  const scrolledUnder = useRef(new Set<Element>());
  const [scrolled, setScrolled] = useState(false);
  const onScrollCapture = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.scrollTop > 20) scrolledUnder.current.add(el);
    else scrolledUnder.current.delete(el);
    setScrolled([...scrolledUnder.current].some((x) => x.isConnected));
  };

  // The thought-map page's pane: a header row of its own (no writer's bar),
  // whose pen line inks in whole while anything under it has scrolled (the
  // editor, or the reading panel's own scroller).
  const headed = open && !bar && !!onClose;
  const paneScrolledUnder = useRef(new Set<Element>());
  const [paneScrolled, setPaneScrolled] = useState(false);
  const onPaneScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.scrollTop > 4) paneScrolledUnder.current.add(el);
    else paneScrolledUnder.current.delete(el);
    setPaneScrolled([...paneScrolledUnder.current].some((x) => x.isConnected));
  };
  const mapRef = useRef<HTMLDivElement>(null);
  // A pane opened again starts at its top, its line at rest.
  useEffect(() => {
    if (open) return;
    paneScrolledUnder.current.clear();
    setPaneScrolled(false);
  }, [open]);

  // Escape hides the pane, as its →| does — unless something over it is the
  // one to close (a dialog, a menu, an open list: they stand on the page), the
  // key ends an input method's composition (a Chinese IME's Escape only drops
  // its candidates), or it is the map's own (an edge label being named lets
  // Escape cancel it). Typing in a field, Escape first steps out of it to the
  // →| (whose tooltip says what the next Escape does), so a stray press never
  // folds away the card being written. Heard on the way down, as the story
  // editor keeps every Escape to itself.
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!headed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('[role="menu"], [role="listbox"], [aria-modal="true"]')) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && mapRef.current?.contains(target)) return;
      if (target && (target.isContentEditable || target.matches('input, textarea, select'))) {
        paneRef.current?.querySelector<HTMLButtonElement>('header button')?.focus();
        return;
      }
      onClose?.();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [headed, onClose]);

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      data-bar={bar ? '' : undefined}
      onScrollCapture={bar ? onScrollCapture : undefined}
      style={
        {
          '--editor-frac': editorFrac,
          // Under the bar everything keeps clear of it as of the app header,
          // and the boundary between the panes starts on its pen line.
          ...(bar && { '--app-header-h': `${HEADER_TOTAL_H}px`, '--bar-line': `${HEADER_STROKE_Y}px` }),
        } as CSSProperties
      }
    >
      {bar && <HeaderBar title={bar.title} backLabel={tNav('back')} onBack={bar.onBack} scrolled={scrolled} heading />}
      <div ref={mapRef} className={leftOverride ? `${styles.mapPane} ${styles.mapPaneDoc}` : styles.mapPane}>
        {leftOverride ??
          (mapShown.current && (
            <ThoughtMapBoard
              height="100%"
              flush
              onOpenCard={onOpenCard}
              paneOpen={open}
            />
          ))}
        {!bar && (
          <div className={styles.back}>
            {/* Floats over the map: the tonal pill, opaque over the board's dots, no pen line of its own. */}
            <OrganicButton variant="tonal" size="sm" onClick={() => router.back()}>
              <span className={styles.backIcon}>
                <Icon
                  name="arrow-right"
                  size={15}
                  ariaLabel={isMobile ? leaveLabel : undefined}
                />
              </span>
              {!isMobile && leaveLabel}
            </OrganicButton>
          </div>
        )}
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
                <Icon name="arrows-horizontal" size={16} />
              </span>
            </div>
          </div>

          <section className={styles.editorPane}>
            {headed ? (
              // The header stands over what the pane shows, which scrolls
              // (and keeps its sticky toolbar) under the header's pen line.
              <div ref={paneRef} className={styles.paneHeaded}>
                <PaneHeader
                  title={paneTitle}
                  hideLabel={t('closeEditor')}
                  onHide={onClose!}
                  scrolled={paneScrolled}
                />
                <div className={styles.paneBody} onScrollCapture={onPaneScroll}>
                  {children}
                </div>
              </div>
            ) : (
              <div className={styles.paneScroll}>{children}</div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
