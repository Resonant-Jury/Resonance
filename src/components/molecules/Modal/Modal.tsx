'use client';

import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import styles from './Modal.module.css';
import { INK } from '@/lib/design/strokes';

export interface ModalProps {
  open: boolean;
  /**
   * Closes it: a click on the backdrop, Escape, and the close itself. Left
   * out while something is in flight (a publish, a delete), when nothing may
   * close it.
   */
  onClose?: () => void;
  children: ReactNode;
  maxWidth?: number;
  seed?: number;
  fillColor?: string;
  borderColor?: string;
  padding?: CSSProperties['padding'];
  ariaLabel?: string;
  /** The close's words: its name for a screen reader, and its label with `closeButton`. 關閉 / Close by default. */
  closeLabel?: string;
  /**
   * For a modal whose foot has nothing else to do — a list, a picker: the
   * close is drawn there, a quiet centred text button, as in the apps.
   */
  closeButton?: boolean;
}

/**
 * The browser's own bars (Android Chrome's, an installed app's status bar)
 * are painted in the page's theme colour, which no scrim reaches: while a
 * modal is open they take the scrim's colour over the cream, so the whole
 * screen dims as one and no bright band is left at the top. Keep it the
 * module CSS's `.backdrop` over #faf2e9 (--color-text at 24%).
 */
const DIMMED_THEME_COLOR = '#c9c0b6';
let dimmed = 0;
let themeColors: [HTMLMetaElement, string][] = [];

function dimThemeColor() {
  if (dimmed++ > 0) return;
  themeColors = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map(
    (meta) => [meta, meta.content],
  );
  for (const [meta] of themeColors) meta.content = DIMMED_THEME_COLOR;
}

function restoreThemeColor() {
  if (--dimmed > 0) return;
  for (const [meta, content] of themeColors) meta.content = content;
  themeColors = [];
}

/**
 * While `active`, the browser's own bars take the scrim's colour, as under a
 * modal — for anything else that dims the whole window with the same scrim
 * (`color-mix(in oklch, var(--color-text) 24%, transparent)`): the thread's
 * long-press menu.
 */
export function useDimmedChrome(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    dimThemeColor();
    return restoreThemeColor;
  }, [active]);
}

/** What Tab can reach inside a dialog. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab and Shift+Tab walk round the dialog instead of out of it into the page
 * under the backdrop (which a click can't reach either): past the last
 * control to the first, before the first to the last.
 */
function keepFocusIn(panel: HTMLElement | null, e: KeyboardEvent) {
  if (!panel) return;
  const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden], [aria-hidden="true"]'));
  if (!stops.length) {
    e.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = stops[0];
  const last = stops[stops.length - 1];
  const at = document.activeElement;
  const inside = at instanceof Node && panel.contains(at);
  if (e.shiftKey && (!inside || at === first || at === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || at === last)) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The hand-drawn dialog. It has no ✕: every way on lies in its own buttons,
 * and a click on the backdrop or Escape closes it (as in the apps). A screen
 * reader still finds a close button inside it — hidden until keyboard focus
 * reaches it — or the visible one at its foot with `closeButton`.
 */
export function Modal({
  open,
  onClose,
  children,
  maxWidth = 440,
  seed = 17,
  fillColor = 'var(--color-card-bg)',
  borderColor = 'oklch(40% 0.06 60)',
  padding = '32px 28px',
  ariaLabel = 'Dialog',
  closeLabel,
  closeButton = false,
}: ModalProps) {
  const t = useTranslations('safety.report');
  const close = closeLabel ?? t('close');
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // `mounted` must be a measurement dep: when the Modal mounts with `open`
  // already true (conditionally rendered confirms), the first measure effect
  // runs before the portal exists (ref is null) and `open` never changes — so
  // without `mounted` the size stays 0×0 and the wobbly background never draws.
  const { w, h } = useElementSize(ref, 0, 0, [open, mounted]);
  const R = 26;
  const mag = Math.min(w, h) * 0.025;
  // A click closes only when it began on the backdrop too: text selected by
  // dragging out of the dialog must not throw the dialog away.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!onClose) return;
        // This dialog is what Escape closes — nothing under it (a search open over a thread) closes with it.
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        keepFocusIn(ref.current, e);
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useDimmedChrome(open);

  // Focus goes into the dialog when it opens (unless a field in it took it
  // already), so a screen reader is in it and Tab starts there; it goes back
  // to whatever opened it when it closes.
  useEffect(() => {
    const panel = ref.current;
    if (!open || !mounted || !panel) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return () => {
      const lost = document.activeElement === document.body || panel.contains(document.activeElement);
      if (before?.isConnected && lost) before.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const borderPath =
    w && h
      ? wobRect(w, h, R, seed, mag, {
          segmentsH: [3, 4],
          segmentsV: [5, 6],
          curve: 0.6,
          cornerJitter: 0.9,
          cornerOffset: 5,
        })
      : '';

  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose?.();
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={styles.dialog}
        style={{ maxWidth, padding }}
      >
        <HandDrawnBorder
          w={w} h={h} R={R} seed={seed} mag={mag}
          fillColor={fillColor}
          strokeColor="transparent"
          strokeWidth={0}
          chalkSeed={seed + 1}
          segmentsH={[3, 4]} segmentsV={[5, 6]}
          curve={0.6} cornerJitter={0.9} cornerOffset={5}
        />
        <ShapeGrain w={w} h={h} d={borderPath} opacity={0.3} frequency={0.88} seed={seed} />
        <HandDrawnBorder
          w={w} h={h} R={R} seed={seed} mag={mag}
          strokeColor={borderColor}
          strokeWidth={INK}
          segmentsH={[3, 4]} segmentsV={[5, 6]}
          curve={0.6} cornerJitter={0.9} cornerOffset={5}
        />
        <div className={styles.content}>
          {children}
          {closeButton && onClose && (
            // The modal is the frame, so the close draws none of its own.
            <div className={styles.closeRow}>
              <OrganicButton variant="text" size="sm" onClick={onClose}>
                {close}
              </OrganicButton>
            </div>
          )}
        </div>
        {!closeButton && onClose && (
          <button type="button" className={styles.hiddenClose} onClick={onClose}>
            {close}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
