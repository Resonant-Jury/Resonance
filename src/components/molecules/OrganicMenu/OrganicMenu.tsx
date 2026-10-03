'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { RowInkWash, useRowInk } from '@/components/atoms/RowInk/RowInk';
import { wobRect } from '@/lib/design/wobRect';
import { wobCircle } from '@/lib/design/wobCircle';
import { dividerPath, rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import styles from './OrganicMenu.module.css';

export interface OrganicMenuItem {
  key: string;
  icon: IconName;
  label: ReactNode;
  /** Destructive rows get the warning wash (the card menu's delete-row language). */
  danger?: boolean;
}

export interface OrganicMenuProps {
  items: OrganicMenuItem[];
  onChoose: (key: string) => void;
  /** Accessible name for the trigger button. */
  label: string;
  /** Wobble seed so the trigger chip is deterministic per host. */
  seed?: number;
  /** Accent hue for the chip/panel; defaults to the theme terracotta. */
  hue?: number;
  /** Disables the rows while an action is in flight. */
  busy?: boolean;
  triggerIcon?: IconName;
  triggerSize?: number;
  /**
   * A bare glyph on the page's own paper (no chip): muted ink at rest, a soft
   * disc of ink under it on hover, focus and while open, and `label` shown
   * as a tooltip on hover and keyboard focus — the frameless trigger has to
   * say what it is for. Its hit area is 36px, 44px under a coarse pointer
   * (`triggerSize` is ignored).
   */
  bare?: boolean;
  /**
   * For `bare`: muted ink at rest (default), or full ink — a trigger leading
   * or closing a bar's row beside the bar's back arrow, which is full ink.
   */
  tone?: 'muted' | 'ink';
  /** For `bare`: where its tooltip hangs — over it (default), or under it at the top of a screen. */
  tip?: 'above' | 'below';
  /** A quiet line under the rows (a message's full time), parted from them by one more divider. */
  footer?: ReactNode;
  /**
   * The panel floats over the page (a portal, `position: fixed`) instead of
   * hanging in the trigger's box — for a trigger inside something that
   * scrolls or clips, like a message in a thread. It opens below the trigger,
   * or above it when there is no room below, its `align` edge on the
   * trigger's, and it closes when the page under it scrolls.
   */
  floating?: boolean;
  /** For `floating`: which edges line up — the panel's right on the trigger's (`end`), or its left (`start`). */
  align?: 'start' | 'end';
  /** The trigger's open state changes (a host that keeps its trigger shown while the menu is open). */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** The `--menu-*` colours a panel draws with: the theme's terracotta, or the accent `hue`. */
function menuColors(hue: number | undefined): CSSProperties {
  return (
    hue === undefined
      ? {
          '--menu-border': 'var(--color-terracotta)',
          '--menu-border-hover': 'color-mix(in oklch, var(--color-terracotta), black 25%)',
          '--menu-cream': 'var(--color-cream)',
          '--menu-divider': 'color-mix(in oklch, var(--color-terracotta) 40%, transparent)',
        }
      : {
          '--menu-border': `oklch(52% 0.11 ${hue})`,
          '--menu-border-hover': `oklch(38% 0.09 ${hue})`,
          '--menu-cream': `oklch(98% 0.01 ${hue})`,
          '--menu-divider': `oklch(55% 0.04 ${hue} / 0.4)`,
        }
  ) as CSSProperties;
}

/** A panel's height: its rows, and the footer line under them. */
export function menuPanelHeight(rows: number, footer: boolean): number {
  return rows * ROW_H + (footer ? FOOTER_H : 0);
}

/** Room kept between a floating panel and the window's edge. */
const EDGE = 12;

/**
 * The organic「⋯」dropdown, extracted from the card menu's language: a wobbly
 * chip trigger dropping a hand-drawn panel with wavy pen dividers and a
 * spreading ink wash on the hovered row. Closes on outside pointer-down or
 * Escape. The chip is paper with no rim — it sits on a card's cover or beside
 * a title, already framed, like the apps' (their bars draw the glyph bare).
 */
export function OrganicMenu({
  items,
  onChoose,
  label,
  seed = 7,
  hue,
  busy = false,
  triggerIcon = 'dots',
  triggerSize = 38,
  bare = false,
  tone = 'muted',
  tip = 'above',
  footer,
  floating = false,
  align = 'end',
  onOpenChange,
  className,
}: OrganicMenuProps) {
  const [open, setOpen] = useState(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  // A floating panel's place on the screen, from the trigger's as it opened.
  const [placed, setPlaced] = useState<CSSProperties | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Escape puts away a bare trigger's tooltip until the pointer or focus
  // leaves (content shown on hover or focus has to be dismissible).
  const [tipDismissed, setTipDismissed] = useState(false);
  const [panelSeed, setPanelSeed] = useState(seed);
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // A floating panel stays where it opened: whatever scrolls under it takes it away.
    function onScroll(e: Event) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    if (floating) {
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', close);
    }
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, floating]);

  const styleOverrides = menuColors(hue);

  /** Where a floating panel goes: under the trigger when it fits, else over it; its `align` edge on the trigger's. */
  function place(trigger: HTMLElement): CSSProperties {
    const r = trigger.getBoundingClientRect();
    const h = menuPanelHeight(items.length, footer != null);
    const below = r.bottom + 8 + h <= window.innerHeight - EDGE || r.top - 8 - h < EDGE;
    return {
      ...(below ? { top: r.bottom + 8 } : { bottom: window.innerHeight - r.top + 8 }),
      ...(align === 'end'
        ? { right: Math.max(EDGE, window.innerWidth - r.right) }
        : { left: Math.max(EDGE, r.left) }),
      transformOrigin: `${below ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}`,
    };
  }

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={styleOverrides}
    >
      <button
        type="button"
        className={bare ? `${styles.trigger} ${styles.bare}` : styles.trigger}
        style={bare ? undefined : { width: triggerSize, height: triggerSize }}
        data-open={open || undefined}
        data-tone={bare ? tone : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={label}
        onKeyDown={bare ? (e) => e.key === 'Escape' && setTipDismissed(true) : undefined}
        onMouseLeave={bare ? () => setTipDismissed(false) : undefined}
        onBlur={bare ? () => setTipDismissed(false) : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (floating) setPlaced(place(e.currentTarget));
          setOpen((v) => {
            const next = !v;
            if (next) setPanelSeed(Math.floor(Math.random() * 10000));
            return next;
          });
        }}
      >
        {bare ? (
          <BareWash seed={seed} />
        ) : (
          <HandDrawnBorder
            w={triggerSize}
            h={triggerSize}
            R={triggerSize * 0.42}
            seed={seed}
            mag={triggerSize * 0.03}
            fillColor="color-mix(in oklch, var(--menu-cream) 94%, transparent)"
            segmentsH={1}
            segmentsV={1}
            curve={1.4}
            cornerJitter={2.4}
          />
        )}
        <span className={styles.triggerIcon}>
          <Icon name={triggerIcon} size={bare ? 22 : Math.round(triggerSize * 0.53)} strokeWidth={INK} />
        </span>
      </button>
      {bare && (
        <span className={styles.tip} aria-hidden="true" data-side={tip} data-dismissed={tipDismissed || undefined}>
          {label}
        </span>
      )}

      {open &&
        (floating && placed ? (
          createPortal(
            <div className={styles.floating} style={{ ...styleOverrides, ...placed }}>
              <MenuPanel
                ref={panelRef}
                uid={uid}
                seed={panelSeed}
                items={items}
                busy={busy}
                footer={footer}
                placed
                onChoose={(key) => {
                  setOpen(false);
                  onChoose(key);
                }}
              />
            </div>,
            document.body,
          )
        ) : (
          <MenuPanel
            ref={panelRef}
            uid={uid}
            seed={panelSeed}
            items={items}
            busy={busy}
            footer={footer}
            onChoose={(key) => {
              setOpen(false);
              onChoose(key);
            }}
          />
        ))}
    </div>
  );
}

export interface OrganicMenuPanelProps {
  items: OrganicMenuItem[];
  onChoose: (key: string) => void;
  seed: number;
  busy?: boolean;
  /** A quiet line under the rows, parted from them by one more divider. */
  footer?: ReactNode;
  hue?: number;
  /** The corner it grows from (CSS `transform-origin`): the edge of what it belongs to. */
  origin?: string;
  className?: string;
}

/**
 * The menu's panel on its own, for a host that places it — the thread's
 * long-press menu, which hangs it under the message it lifted. The same
 * wobbly card, wavy dividers and spreading row ink as the dropdown's.
 */
export function OrganicMenuPanel({ items, onChoose, seed, busy = false, footer, hue, origin, className }: OrganicMenuPanelProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className={className} style={{ ...menuColors(hue), ...(origin ? { transformOrigin: origin } : {}) }}>
      <MenuPanel uid={uid} seed={seed} items={items} busy={busy} footer={footer} placed onChoose={onChoose} />
    </div>
  );
}

/**
 * The bare trigger's hover disc: a wobbly circle of ink at a low tint, drawn
 * in a 100-unit box so CSS sizes it with the hit area and grows it by
 * `transform` (no repaint of the page under it).
 */
function BareWash({ seed }: { seed: number }) {
  const d = useMemo(() => wobCircle(50, 50, 46, seed, { segments: 8, mag: 2.2, cpJitter: 0.4 }), [seed]);
  return (
    <svg className={styles.wash} viewBox="0 0 100 100" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ROW_H = 42;
/** The footer line is a little shorter than a row. */
const FOOTER_H = 38;

interface MenuPanelProps {
  uid: string;
  seed: number;
  items: OrganicMenuItem[];
  busy: boolean;
  footer?: ReactNode;
  /** Placed by its host (or a floating wrapper) rather than hung under the trigger. */
  placed?: boolean;
  onChoose: (key: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}

function MenuPanel({ uid, seed, items, busy, footer, placed = false, onChoose, ref: outerRef }: MenuPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The panel's own ref (it measures itself) and the host's (whose outside-click test needs it).
  const setRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (typeof outerRef === 'function') outerRef(el);
    else if (outerRef) (outerRef as React.RefObject<HTMLDivElement | null>).current = el;
  };
  const hasFooter = footer != null;
  // The footer is one more band under the rows: a divider above it, and no ink in it.
  const bands = items.length + (hasFooter ? 1 : 0);
  const h = menuPanelHeight(items.length, hasFooter);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recompute = () => setW(el.offsetWidth);
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = Math.max(10, h * 0.04);

  const outerPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, 16, seed + 100, autoMag(w, h), {
      segmentsH: autoSegments(w),
      segmentsV: autoSegments(h),
      curve: autoCurve(w, h),
    });
  }, [w, h, seed]);

  const boundaries = useMemo<[number, number][][]>(() => {
    if (!w) return [];
    return Array.from({ length: bands - 1 }, (_, i) => rowBoundary((i + 1) * ROW_H, w, seed + i * 31 + 7, 2, pad));
  }, [w, bands, seed, pad]);

  const ready = w > 0 && boundaries.length === bands - 1;
  const dangerIndex = items.findIndex((it) => it.danger);

  // Pointer-driven only: the rows are plain buttons the keyboard tabs through,
  // so there is no active row to rest the ink on.
  const ink = useRowInk({ panelRef: ref, w, h });
  const washes: string[] = items.map((_, i) =>
    i === dangerIndex
      ? 'color-mix(in oklch, var(--color-yellow) 45%, var(--menu-cream))'
      : 'color-mix(in oklch, var(--menu-border-hover) 15%, transparent)',
  );
  // The footer's band takes no ink.
  if (hasFooter) washes.push('transparent');

  return (
    <div ref={setRef} className={placed ? `${styles.panel} ${styles.placed}` : styles.panel} style={{ height: `${h}px` }}>
      {w > 0 && (
        <svg
          className={`${styles.border} res-shape-fade-in`}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          <defs>
            <clipPath id={`organicmenu-clip-${uid}`}>
              <path d={outerPath} />
            </clipPath>
          </defs>
          <g clipPath={`url(#organicmenu-clip-${uid})`}>
            <path d={outerPath} fill="var(--menu-cream)" />
            {/* warning wash under the destructive row, before any hover */}
            {ready && dangerIndex >= 0 && (
              <path
                d={rowRegion(dangerIndex, bands, boundaries, w, h, pad)}
                fill="color-mix(in oklch, var(--color-yellow) 25%, var(--menu-cream))"
              />
            )}
            {/* the hovered row's ink, spreading from the pointer */}
            {ready && (
              <RowInkWash
                uid={`organicmenu-${uid}`}
                ink={ink}
                boundaries={boundaries}
                w={w}
                h={h}
                pad={pad}
                fills={washes}
              />
            )}
          </g>
          {ready &&
            boundaries.map((pts, i) => (
              <path
                key={i}
                d={dividerPath(pts)}
                fill="none"
                stroke="var(--menu-divider)"
                strokeWidth={INK_LIGHT}
                strokeLinecap="round"
                clipPath={`url(#organicmenu-clip-${uid})`}
              />
            ))}
          <path
            d={outerPath}
            fill="none"
            stroke="var(--menu-border)"
            strokeWidth={INK}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div id={`${uid}-menu`} role="menu" className={styles.list}>
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className={styles.option}
            data-active={ink.index === i || undefined}
            disabled={busy}
            {...ink.rowProps(i)}
            onClick={() => onChoose(it.key)}
          >
            <span className={styles.optionIcon}>
              <Icon name={it.icon} size={17} strokeWidth={INK} />
            </span>
            {it.label}
          </button>
        ))}
        {hasFooter && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
