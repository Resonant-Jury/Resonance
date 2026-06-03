'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { wobRect } from '@/lib/design/wobRect';
import { makePrng } from '@/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import styles from './Subnavbar.module.css';

type ItemKey = 'me' | 'settings' | 'signOut';

interface MenuItem {
  key: ItemKey;
  icon: IconName;
  href?: '/me' | '/settings';
  tone?: 'danger';
}

const ITEMS: MenuItem[] = [
  { key: 'me', icon: 'cards', href: '/me' },
  { key: 'settings', icon: 'pen', href: '/settings' },
  { key: 'signOut', icon: 'logout', tone: 'danger' },
];

export interface SubnavbarProps {
  user: { initials: string; handle: string; accentColor: string };
  /** Seed so the wobble of the dropped card is deterministic per-instance. */
  seed?: number;
}

/**
 * Account menu hanging off the header avatar. Closed, it's just the avatar;
 * clicking it drops an organic wobbly card — the same hand-drawn language as
 * `<Select>` — listing 我的卡片盒 / 設定 / 登出, with wavy pen dividers between
 * rows and the active row washed in along the curved divider regions.
 */
export function Subnavbar({ user, seed = 91 }: SubnavbarProps) {
  const t = useTranslations('app.nav');
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');

  function openMenu() {
    setActiveIndex(0);
    setOpen(true);
  }

  const activate = useCallback(
    async (i: number) => {
      const item = ITEMS[i];
      if (!item) return;
      if (item.href) {
        setOpen(false);
        triggerRef.current?.focus();
        router.push(item.href);
        return;
      }
      if (item.key === 'signOut') {
        if (signingOut) return;
        setSigningOut(true);
        try {
          await auth.signOut();
          window.location.href = `/${locale}/signin`;
        } catch {
          setSigningOut(false);
          setOpen(false);
        }
      }
    },
    [router, auth, locale, signingOut],
  );

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((i) => Math.min(ITEMS.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openMenu();
        else void activate(activeIndex);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.handle}
        aria-activedescendant={open ? `${uid}-opt-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <HandDrawnAvatar initials={user.initials} size={36} color={user.accentColor} seed={77} />
      </button>

      {open && (
        <SubnavPanel
          seed={seed}
          uid={uid}
          activeIndex={activeIndex}
          signingOut={signingOut}
          onActivate={setActiveIndex}
          onChoose={(i) => void activate(i)}
          label={(key) => t(key)}
        />
      )}
    </div>
  );
}

interface SubnavPanelProps {
  seed: number;
  uid: string;
  activeIndex: number;
  signingOut: boolean;
  onActivate: (i: number) => void;
  onChoose: (i: number) => void;
  label: (key: ItemKey) => string;
}

// A gently wavy horizontal boundary between two rows, as a point list so the
// row fills and the stroked dividers share identical geometry. Runs from -pad
// to w+pad so fills overshoot and the outer clip trims them flush to the
// wobbly border (no slivers, dividers reach both edges).
function rowBoundary(
  y: number,
  w: number,
  seed: number,
  amp: number,
  pad: number,
): [number, number][] {
  const steps = 4;
  const rnd = makePrng(seed);
  const f = (n: number): number => +n.toFixed(2);
  const pts: [number, number][] = [[-pad, f(y)]];
  for (let k = 0; k <= steps; k++) {
    const x = (k / steps) * w;
    const off = k === 0 || k === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([f(x), f(y + off)]);
  }
  pts.push([w + pad, f(y)]);
  return pts;
}

// Smooth cubic segments through the points, horizontal control handles.
function segs(pts: [number, number][]): string {
  const f = (n: number): number => +n.toFixed(2);
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const hx = (x1 - x0) / 3;
    d += ` C ${f(x0 + hx)},${f(y0)} ${f(x1 - hx)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

const dividerPath = (pts: [number, number][]): string => `M ${pts[0][0]},${pts[0][1]}` + segs(pts);

// Closed region for one row, bounded by the wavy divider above and below (or
// the padded panel edge for the first/last row), so the active wash fills the
// curve-divided area rather than a rectangle.
function rowRegion(
  i: number,
  count: number,
  boundaries: [number, number][][],
  w: number,
  h: number,
  pad: number,
): string {
  const top: [number, number][] = i === 0 ? [[-pad, -pad], [w + pad, -pad]] : boundaries[i - 1];
  const bottom: [number, number][] =
    i === count - 1 ? [[-pad, h + pad], [w + pad, h + pad]] : boundaries[i];
  const botRev = [...bottom].reverse();
  return (
    `M ${top[0][0]},${top[0][1]}` +
    segs(top) +
    ` L ${botRev[0][0]},${botRev[0][1]}` +
    segs(botRev) +
    ' Z'
  );
}

function SubnavPanel({
  seed,
  uid,
  activeIndex,
  signingOut,
  onActivate,
  onChoose,
  label,
}: SubnavPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ROW_H = 44;
  const h = ITEMS.length * ROW_H;
  const [{ w }, setDims] = useState({ w: 0 });

  // Pre-defined static coordinates since every row option button is exactly ROW_H high
  const rows = useMemo(() => ITEMS.map((_, i) => ({ top: i * ROW_H, height: ROW_H })), []);

  // Hover and mouse position tracking for the SegmentedActionBar style wash
  const [hovered, setHovered] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setDims({ w: el.offsetWidth });
  }, []);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [recompute]);

  const pad = h > 0 ? Math.max(10, h * 0.04) : 0;

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
    return rows.slice(1).map((r, i) => {
      const prev = rows[i];
      const y = (prev.top + prev.height + r.top) / 2;
      return rowBoundary(y, w, seed + i * 31 + 7, 3, pad);
    });
  }, [w, rows, seed, pad]);

  const ready = w > 0 && h > 0 && boundaries.length === ITEMS.length - 1;

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const hoverMaxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 4;
  const currentHovered = hovered !== null ? hovered : activeIndex;

  // Sync activeIndex changes (like keyboard arrows) to center the wash circle
  useEffect(() => {
    if (activeIndex >= 0 && rows[activeIndex] && w > 0) {
      const r = rows[activeIndex];
      setPos({ x: w / 2, y: r.top + r.height / 2 });
    }
  }, [activeIndex, rows, w]);

  return (
    <div ref={ref} className={styles.panel} style={{ height: `${h}px` }}>
      {w > 0 && h > 0 && (
        <svg
          className={`${styles.border} res-shape-fade-in`}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          <defs>
            <clipPath id={`subnav-clip-${uid}`}>
              <path d={outerPath} />
            </clipPath>
            {/* One pointer-anchored reveal circle per row */}
            {ITEMS.map((item, i) => (
              <mask
                key={item.key}
                id={`subnav-hover-${uid}-${i}`}
                maskUnits="userSpaceOnUse"
                x={-w}
                y={-h}
                width={w * 3}
                height={h * 3}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={currentHovered === i ? hoverMaxR : 0}
                  fill="white"
                  style={{ transition: 'r 340ms linear' }}
                />
              </mask>
            ))}
          </defs>
          <g clipPath={`url(#subnav-clip-${uid})`}>
            {/* opaque card fill */}
            <path d={outerPath} fill="var(--color-cream)" />
            {/* hover wash revealed through the circle masks */}
            {ready &&
              ITEMS.map((item, i) => (
                <g key={item.key} mask={`url(#subnav-hover-${uid}-${i})`}>
                  <path
                    d={rowRegion(i, ITEMS.length, boundaries, w, h, pad)}
                    fill="color-mix(in oklch, var(--color-terracotta) 13%, transparent)"
                  />
                </g>
              ))}
          </g>
          {/* wavy dividers — drawn past the edges, clipped flush to the border */}
          {ready &&
            boundaries.map((pts, i) => (
              <path
                key={i}
                d={dividerPath(pts)}
                fill="none"
                stroke="oklch(60% 0.04 60 / 0.45)"
                strokeWidth={1.6}
                strokeLinecap="round"
                clipPath={`url(#subnav-clip-${uid})`}
              />
            ))}
          {/* outer stroke */}
          <path
            d={outerPath}
            fill="none"
            stroke="var(--field-border-hover)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div className={styles.list} role="menu" aria-label={label('me')}>
        {ITEMS.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            id={`${uid}-opt-${i}`}
            className={styles.option}
            data-active={i === activeIndex || undefined}
            data-tone={item.tone}
            disabled={item.key === 'signOut' && signingOut}
            onClick={() => onChoose(i)}
            onMouseEnter={(e) => {
              recordPointer(e);
              onActivate(i);
              setHovered(i);
            }}
            onMouseMove={recordPointer}
            onMouseLeave={() => setHovered((cur) => (cur === i ? null : cur))}
          >
            <Icon name={item.icon} size={18} strokeWidth={1.8} className={styles.optionIcon} />
            <span className={styles.optionLabel}>
              {item.key === 'signOut' && signingOut ? '…' : label(item.key)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
