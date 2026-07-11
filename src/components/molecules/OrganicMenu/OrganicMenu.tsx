'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { wobRect } from '@/lib/design/wobRect';
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
  className?: string;
}

/**
 * The organic「⋯」dropdown, extracted from the card menu's language: a wobbly
 * chip trigger dropping a hand-drawn panel with wavy pen dividers and per-row
 * washes. Closes on outside pointer-down or Escape.
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
  className,
}: OrganicMenuProps) {
  const [open, setOpen] = useState(false);
  const [panelSeed, setPanelSeed] = useState(seed);
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const styleOverrides =
    hue === undefined
      ? ({
          '--menu-border': 'var(--color-terracotta)',
          '--menu-border-hover': 'color-mix(in oklch, var(--color-terracotta), black 25%)',
          '--menu-cream': 'var(--color-cream)',
          '--menu-divider': 'color-mix(in oklch, var(--color-terracotta) 40%, transparent)',
        } as React.CSSProperties)
      : ({
          '--menu-border': `oklch(52% 0.11 ${hue})`,
          '--menu-border-hover': `oklch(38% 0.09 ${hue})`,
          '--menu-cream': `oklch(98% 0.01 ${hue})`,
          '--menu-divider': `oklch(55% 0.04 ${hue} / 0.4)`,
        } as React.CSSProperties);

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={styleOverrides}
    >
      <button
        type="button"
        className={styles.trigger}
        style={{ width: triggerSize, height: triggerSize }}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) setPanelSeed(Math.floor(Math.random() * 10000));
            return next;
          });
        }}
      >
        <HandDrawnBorder
          w={triggerSize}
          h={triggerSize}
          R={triggerSize * 0.42}
          seed={seed}
          mag={triggerSize * 0.03}
          fillColor="color-mix(in oklch, var(--menu-cream) 90%, transparent)"
          strokeColor="var(--menu-border)"
          strokeWidth={INK}
          segmentsH={1}
          segmentsV={1}
          curve={1.4}
          cornerJitter={2.4}
        />
        <span className={styles.triggerIcon}>
          <Icon name={triggerIcon} size={Math.round(triggerSize * 0.53)} strokeWidth={INK} />
        </span>
      </button>

      {open && (
        <MenuPanel
          uid={uid}
          seed={panelSeed}
          items={items}
          busy={busy}
          onChoose={(key) => {
            setOpen(false);
            onChoose(key);
          }}
        />
      )}
    </div>
  );
}

const ROW_H = 42;

interface MenuPanelProps {
  uid: string;
  seed: number;
  items: OrganicMenuItem[];
  busy: boolean;
  onChoose: (key: string) => void;
}

function MenuPanel({ uid, seed, items, busy, onChoose }: MenuPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const h = items.length * ROW_H;
  const [w, setW] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

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
    return items.slice(1).map((_, i) => rowBoundary((i + 1) * ROW_H, w, seed + i * 31 + 7, 2, pad));
  }, [w, items, seed, pad]);

  const ready = w > 0 && boundaries.length === items.length - 1;
  const dangerIndex = items.findIndex((it) => it.danger);

  return (
    <div ref={ref} className={styles.panel} style={{ height: `${h}px` }}>
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
                d={rowRegion(dangerIndex, items.length, boundaries, w, h, pad)}
                fill="color-mix(in oklch, var(--color-yellow) 25%, var(--menu-cream))"
              />
            )}
            {/* hover wash for the active row */}
            {ready && hovered !== null && (
              <path
                d={rowRegion(hovered, items.length, boundaries, w, h, pad)}
                fill={
                  hovered === dangerIndex
                    ? 'color-mix(in oklch, var(--color-yellow) 45%, var(--menu-cream))'
                    : 'color-mix(in oklch, var(--menu-border-hover) 15%, transparent)'
                }
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
            data-active={hovered === i || undefined}
            disabled={busy}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((v) => (v === i ? null : v))}
            onClick={() => onChoose(it.key)}
          >
            <span className={styles.optionIcon}>
              <Icon name={it.icon} size={17} strokeWidth={INK} />
            </span>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
