'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { HeaderBar } from '@/components/sections/AppHeader/HeaderBar';
import { HEADER_TOTAL_H } from '@/components/sections/AppHeader/HeaderChrome';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import { PaneHeader } from './PaneHeader';
import styles from './WriteWorkspace.module.css';

/* The editor pane may shrink to a comfortable reading column and grow at most
   to a 1:1 split — the map keeps at least half the screen or it stops being a
   map (desktop; below 1200px the pane simply covers the viewport). */
export const MIN_EDITOR_FRAC = 0.32;
export const MAX_EDITOR_FRAC = 0.5;
/** Dragged on past the narrowest, a pane narrower than this hides on release. */
export const HIDE_EDITOR_FRAC = 0.18;
/** One arrow key's step of the divider. */
const KEY_STEP = 0.02;
/** How far the docked grip is dragged toward the map before it shows the pane. */
const SHOW_DRAG_PX = 8;

export interface WorkspaceShellProps {
  /** Whether there is something in the right (editor) pane; none = full-bleed map. */
  open: boolean;
  /**
   * Closes the pane below the split, where it covers the map (the
   * thought-map page; the writer's bar has the way back instead): the pane's
   * header row carries the control, and Escape does it.
   */
  onClose?: () => void;
  /**
   * At the split, the pane folded away by its divider (or Escape) — kept
   * mounted as it was, the map taking the whole width: what it shows is to be
   * saved at once.
   */
  onHide?: () => void;
  /** What the pane shows, named in its header row below the split (with `onClose` and no `bar`). */
  paneTitle?: ReactNode;
  /**
   * Which card the pane shows (its id): another card opened while the pane is
   * open starts at its top, the header's line at rest; and closing the pane
   * hands focus back to that card on the map when what opened it is gone.
   */
  paneKey?: string;
  /** Host override for the map's「開啟卡片」. */
  onOpenCard?: (card: Card) => void;
  /**
   * The card the pane shows, when it may be on the map: the map brings it to
   * the centre of what is left of it whenever its width settles (the pane
   * opened or shown again, another card opened, the divider released).
   */
  focusCardId?: string | null;
  /** Replaces the map entirely (resonance writing shows the original card). */
  leftOverride?: ReactNode;
  /**
   * The writer's bar below the split, as on the apps' writer page: the back
   * arrow and the title of what the pane shows, what scrolls passing under
   * its pen line, over the pane that covers the map. At the split the
   * workspace is one page with the thought map's: no bar, the Leave floating
   * over the map (`onLeave`) its way back.
   */
  bar?: { title: ReactNode; onBack: () => void };
  /** The Leave floating over the map; the page's history back without it. */
  onLeave?: () => void;
  children: ReactNode;
}

/**
 * The unified full-viewport workspace: thought map fixed on the left, the
 * pane on the right — at the split (≥ 1200px) one page whichever way it was
 * come into (the writer, or the thought-map page): no bar, no header row in
 * the pane, the Leave floating over the map. The boundary is the pane's own
 * straight edge, and a grip riding on it is the divider: dragged, it resizes
 * the editor (32–50 % of the width); dragged on toward the edge, the pane
 * follows, dims once narrower than 18 %, and hides on release there (the
 * pill says so) — the grip then docks at the edge and shows it again, as it
 * was. Below the split the pane covers the map: the writer stands its bar
 * over it, the thought-map page's pane has its own header row.
 */
export function WorkspaceShell({
  open,
  onClose,
  onHide,
  paneTitle,
  paneKey,
  onOpenCard,
  focusCardId,
  leftOverride,
  bar,
  onLeave,
  children,
}: WorkspaceShellProps) {
  const t = useTranslations('write');
  const tMap = useTranslations('me.thoughtMap');
  const tNav = useTranslations('app.nav');
  const isMobile = useIsMobile(640);
  const router = useRouter();
  const paneId = useId();
  // Below the desktop split (the module CSS's 1200px) the open pane covers
  // the map: there it mounts — reading the map and every card on it — only
  // once it is shown, and then stays (a card opened from it returns to it).
  // Unknown until hydrated, so a phone never mounts it in passing.
  const split = useMediaQuery('(min-width: 1200px)');
  const mapShown = useRef(false);
  if (!leftOverride && (!open || split === true)) mapShown.current = true;

  const shellRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [editorFrac, setEditorFrac] = useState(MAX_EDITOR_FRAC);

  // At the split the pane can be folded away by its divider: kept mounted (what it shows stays as it was), the
  // map taking the whole width. Nothing in the pane, nothing folded; a card opened from the map shows it again.
  const [hidden, setHidden] = useState(false);
  if (!open && hidden) setHidden(false);
  const folded = hidden && open && split === true;

  // A drag of the divider: `over` is the pane's width while dragged on past the narrowest (it follows the
  // pointer there), null within 32–50 %; `from` the width it had when the drag began, which it shows again
  // at if this drag hides it.
  const drag = useRef<{ id: number; from: number; x: number; docked: boolean; shown: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  // Bumped once the divider has been released (or stepped by a key): the map's width has settled.
  const [settleKey, setSettleKey] = useState(0);
  const settle = () => setSettleKey((k) => k + 1);
  const inHideZone = over != null && over < HIDE_EDITOR_FRAC;

  const hide = () => {
    // What had the focus in the pane goes with it: the docked grip is where it shows again.
    const active = document.activeElement;
    if (active instanceof HTMLElement && paneRef.current?.contains(active)) railRef.current?.focus();
    setHidden(true);
    onHide?.();
  };
  const show = () => setHidden(false);

  const fracAt = (clientX: number) => {
    const r = shellRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return (r.right - clientX) / r.width;
  };

  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { id: e.pointerId, from: editorFrac, x: e.clientX, docked: folded, shown: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!folded) setDragging(true);
  };
  const onRailPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.docked) {
      // Docked at the edge: drawn toward the map, the pane comes back as it was.
      if (!d.shown && d.x - e.clientX > SHOW_DRAG_PX) {
        d.shown = true;
        show();
      }
      return;
    }
    const f = fracAt(e.clientX);
    if (f == null) return;
    if (f >= MIN_EDITOR_FRAC) {
      setEditorFrac(Math.min(MAX_EDITOR_FRAC, f));
      setOver(null);
    } else {
      setEditorFrac(MIN_EDITOR_FRAC);
      setOver(Math.max(0, f));
    }
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (d.docked) {
      // A tap on the docked grip shows the pane again.
      if (!cancelled && !d.shown && Math.abs(e.clientX - d.x) <= SHOW_DRAG_PX) show();
      return;
    }
    // Released past the hide line: the pane slides away, to come back at the width it had. Between it and the
    // narrowest, the pane springs back to the narrowest.
    if (!cancelled && inHideZone) {
      setEditorFrac(d.from);
      hide();
    } else settle();
    setOver(null);
  };

  // A separator the keyboard moves too: the arrows resize (toward the map widens the editor; from the docked
  // edge, shows it), Enter and Space hide and show.
  const onRailKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (folded) show();
      else hide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (folded) show();
      else {
        setEditorFrac((f) => Math.min(MAX_EDITOR_FRAC, +(f + KEY_STEP).toFixed(2)));
        settle();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (!folded) {
        setEditorFrac((f) => Math.max(MIN_EDITOR_FRAC, +(f - KEY_STEP).toFixed(2)));
        settle();
      }
    }
  };

  // The writer's bar (below the split) inks its pen line in whole while anything under it has scrolled (the
  // draft, or the original card beside it).
  const barShown = !!bar && split !== true;
  const scrolledUnder = useRef(new Set<Element>());
  const [scrolled, setScrolled] = useState(false);
  const onScrollCapture = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.scrollTop > 20) scrolledUnder.current.add(el);
    else scrolledUnder.current.delete(el);
    setScrolled([...scrolledUnder.current].some((x) => x.isConnected));
  };

  // The thought-map page's pane below the split: a header row of its own (no writer's bar), whose pen line
  // inks in whole while anything under it has scrolled (the editor, or the reading panel's own scroller). At
  // the split the pane has none: one page with the writer's.
  const headed = open && !bar && !!onClose && split !== true;
  const paneScrolledUnder = useRef(new Set<Element>());
  const [paneScrolled, setPaneScrolled] = useState(false);
  const onPaneScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.scrollTop > 4) paneScrolledUnder.current.add(el);
    else paneScrolledUnder.current.delete(el);
    setPaneScrolled([...paneScrolledUnder.current].some((x) => x.isConnected));
  };
  const mapRef = useRef<HTMLDivElement>(null);
  const paneBodyRef = useRef<HTMLDivElement>(null);
  // A pane opened again, or showing another card, starts at its top, its line
  // at rest (before it paints: never a frame of the last card's scroll).
  useLayoutEffect(() => {
    paneScrolledUnder.current.clear();
    setPaneScrolled(false);
    if (paneBodyRef.current) paneBodyRef.current.scrollTop = 0;
  }, [open, paneKey]);

  // Below the split the open pane covers the map: nothing on it can be
  // reached (Tab would walk controls no one sees) or keep the focus.
  const mapCovered = open && split === false;

  // Closing the pane unmounts what had the focus (its →|, the field being
  // written in): hand it back to what opened the card — the card's 開啟卡片
  // on the map, or the card itself — rather than drop it to the page. A card
  // opened from the map shows a folded pane again.
  const openerRef = useRef<HTMLElement | null>(null);
  const openFromMap = onOpenCard
    ? (card: Card) => {
        const active = document.activeElement;
        openerRef.current = active instanceof HTMLElement && mapRef.current?.contains(active) ? active : null;
        setHidden(false);
        onOpenCard(card);
      }
    : undefined;
  const shownKey = useRef<string | undefined>(undefined);
  const wasOpen = useRef(open);
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (open) {
      shownKey.current = paneKey;
      return;
    }
    if (!closing || bar || !onClose) return;
    const map = mapRef.current;
    if (!map) return;
    const active = document.activeElement;
    if (active && active !== document.body && map.contains(active)) return;
    const opener = openerRef.current;
    const node = Array.from(map.querySelectorAll<HTMLElement>('[data-card-id]')).find(
      (el) => el.dataset.cardId === shownKey.current,
    );
    const back = opener?.isConnected && map.contains(opener) ? opener : node;
    back?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paneKey]);

  // Escape folds the pane away at the split (the writer's or the map page's)
  // and closes the map page's covering pane below it, as its →| does —
  // unless something over it is the one to close (a dialog, a menu, an open
  // list: they stand on the page), the key ends an input method's
  // composition (a Chinese IME's Escape only drops its candidates), or it is
  // a field on the map's own (an edge label being named lets Escape cancel
  // it). A card just opened from the map leaves the focus on its 開啟卡片 (or
  // on the card): Escape works from there too. Typing in a field, Escape
  // first steps out of it — to the divider at the split, to the →| below it
  // (whose tooltip says what the next Escape does) — so a stray press never
  // folds away the card being written. Heard on the way down, as the story
  // editor keeps every Escape to itself.
  const escapes = open && !folded && (split === true || headed);
  useEffect(() => {
    if (!escapes) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('[role="menu"], [role="listbox"], [aria-modal="true"]')) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const editable = !!target && (target.isContentEditable || target.matches('input, textarea, select'));
      // A field on the map (an arrow's label, a region's title being named)
      // keeps its Escape, which cancels it; its buttons and cards do not.
      if (editable && mapRef.current?.contains(target)) return;
      if (editable) {
        if (split === true) railRef.current?.focus();
        else paneRef.current?.querySelector<HTMLButtonElement>('header button')?.focus();
        return;
      }
      if (split === true) hide();
      else onClose?.();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escapes, split, onClose, onHide]);

  const leaveLabel = tMap('leave');
  const shownFrac = folded ? 0 : (over ?? editorFrac);

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      data-bar={bar ? '' : undefined}
      onScrollCapture={barShown ? onScrollCapture : undefined}
      style={
        {
          '--editor-frac': shownFrac,
          '--min-editor-frac': MIN_EDITOR_FRAC,
          // Under the bar (below the split) everything keeps clear of it as of the app header.
          ...(bar && { '--bar-h': `${HEADER_TOTAL_H}px` }),
        } as CSSProperties
      }
    >
      {barShown && (
        <div className={styles.barBelowSplit}>
          <HeaderBar title={bar.title} backLabel={tNav('back')} onBack={bar.onBack} scrolled={scrolled} heading />
        </div>
      )}
      {/* At the split the writer's title is the page's heading still, for a screen reader. */}
      {bar && split === true && <h1 className={styles.srOnly}>{bar.title}</h1>}
      <div
        ref={mapRef}
        className={leftOverride ? `${styles.mapPane} ${styles.mapPaneDoc}` : styles.mapPane}
        inert={mapCovered}
      >
        {leftOverride ??
          (mapShown.current && (
            <ThoughtMapBoard
              height="100%"
              flush
              onOpenCard={openFromMap}
              paneOpen={open && !folded}
              focusCardId={focusCardId}
              settleKey={settleKey}
            />
          ))}
        {(!bar || split !== false) && (
          // Floats over the map: the tonal pill, opaque over the board's dots, no pen line of its own. The
          // writer's only at the split (below it, its bar has the way back).
          <div className={styles.back} data-split-only={bar ? '' : undefined}>
            <OrganicButton variant="tonal" size="sm" onClick={onLeave ?? (() => router.back())}>
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
            ref={railRef}
            className={styles.rail}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={folded ? t('openEditor') : t('resizeDivider')}
            aria-controls={paneId}
            aria-valuemin={0}
            aria-valuemax={Math.round(MAX_EDITOR_FRAC * 100)}
            aria-valuenow={Math.round(shownFrac * 100)}
            title={folded ? t('openEditor') : t('resizeDivider')}
            data-docked={folded || undefined}
            data-dragging={dragging || undefined}
            onPointerDown={onRailPointerDown}
            onPointerMove={onRailPointerMove}
            onPointerUp={(e) => endDrag(e, false)}
            onPointerCancel={(e) => endDrag(e, true)}
            onKeyDown={onRailKeyDown}
          >
            <div className={styles.railGrip} aria-hidden="true">
              <span className={styles.railGripIcon}>
                <Icon name="arrows-horizontal" size={16} />
              </span>
            </div>
            {inHideZone && (
              <span className={styles.releasePill} aria-hidden="true">
                {t('releaseToClose')}
              </span>
            )}
          </div>

          <section
            id={paneId}
            className={styles.editorPane}
            data-folded={folded || undefined}
            data-dragging={dragging || undefined}
            data-dim={inHideZone || undefined}
            inert={folded}
          >
            {/* What the pane shows keeps one place in the tree at every width (the header row comes and goes
                beside it), so crossing the split never remounts the card being written. While the pane is
                narrower than the narrowest (dragged on, sliding away) it keeps that width and is cut at the
                edge: it slides rather than squeezes. */}
            <div className={styles.paneClip}>
              <div ref={paneRef} className={styles.paneHeaded}>
                {headed && (
                  // The header stands over what the pane shows, which scrolls
                  // (and keeps its sticky toolbar) under the header's pen line.
                  <PaneHeader
                    title={paneTitle}
                    hideLabel={t('closeEditor')}
                    onHide={onClose!}
                    scrolled={paneScrolled}
                  />
                )}
                <div ref={paneBodyRef} className={styles.paneBody} onScrollCapture={headed ? onPaneScroll : undefined}>
                  {children}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
