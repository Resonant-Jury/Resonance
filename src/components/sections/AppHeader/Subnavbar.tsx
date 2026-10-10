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
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { RowInkWash, useRowInk } from '@/components/atoms/RowInk/RowInk';
import { SignOutConfirmModal } from '@/components/molecules/SignOutConfirmModal/SignOutConfirmModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { wobRect } from '@/lib/design/wobRect';
import { dividerPath, rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import styles from './Subnavbar.module.css';

type ItemKey = 'me' | 'messages' | 'settings' | 'signOut';

interface MenuItem {
  key: ItemKey;
  icon: IconName;
  href?: '/me' | '/messages' | '/settings';
  tone?: 'danger';
}

const ITEMS: MenuItem[] = [
  { key: 'me', icon: 'cards', href: '/me' },
  { key: 'messages', icon: 'chat', href: '/messages' },
  { key: 'settings', icon: 'pen', href: '/settings' },
  { key: 'signOut', icon: 'logout', tone: 'danger' },
];

// The ink of each row: terracotta, and the warning yellow for signing out.
const INK_WASHES = ITEMS.map((item) =>
  item.key === 'signOut'
    ? 'color-mix(in oklch, var(--color-yellow) 40%, transparent)'
    : 'color-mix(in oklch, var(--color-terracotta) 13%, transparent)',
);

export interface SubnavbarProps {
  user: {
    initials: string;
    handle: string;
    accentColor: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };
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
  const [interactionMode, setInteractionMode] = useState<'mouse' | 'keyboard'>('keyboard');
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');

  function openMenu() {
    setActiveIndex(0);
    setInteractionMode('keyboard');
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
        // Ask first — the modal owns the actual sign-out.
        setOpen(false);
        setConfirmingSignOut(true);
      }
    },
    [router],
  );

  const confirmSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      window.location.href = `/${locale}/signin`;
    } catch {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  }, [auth, locale, signingOut]);

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
        setInteractionMode('keyboard');
        if (!open) openMenu();
        else setActiveIndex((i) => Math.min(ITEMS.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setInteractionMode('keyboard');
        if (!open) openMenu();
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          setInteractionMode('keyboard');
          openMenu();
        }
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
        role="combobox"
        className={styles.trigger}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={user.handle}
        aria-activedescendant={open ? `${uid}-opt-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setInteractionMode('mouse')}
        onMouseDown={() => setInteractionMode('mouse')}
      >
        <HandDrawnAvatar
          src={user.avatarUrl}
          initials={user.initials}
          size={36}
          color={user.accentColor}
          seed={Number(user.avatarSeed) || 77}
        />
      </button>

      {open && (
        <SubnavPanel
          seed={seed}
          uid={uid}
          activeIndex={activeIndex}
          interactionMode={interactionMode}
          setInteractionMode={setInteractionMode}
          signingOut={signingOut}
          onActivate={setActiveIndex}
          onChoose={(i) => void activate(i)}
          label={(key) => t(key)}
        />
      )}

      <SignOutConfirmModal
        open={confirmingSignOut}
        busy={signingOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </div>
  );
}

interface SubnavPanelProps {
  seed: number;
  uid: string;
  activeIndex: number;
  interactionMode: 'mouse' | 'keyboard';
  setInteractionMode: (mode: 'mouse' | 'keyboard') => void;
  signingOut: boolean;
  onActivate: (i: number) => void;
  onChoose: (i: number) => void;
  label: (key: ItemKey) => string;
}

function SubnavPanel({
  seed,
  uid,
  activeIndex,
  interactionMode,
  setInteractionMode,
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

  // The ink follows the pointer; the keyboard's row only counts while the
  // keyboard is the one driving (after the pointer leaves, the wash withdraws).
  const ink = useRowInk({
    panelRef: ref,
    rows,
    w,
    h,
    activeIndex: interactionMode === 'keyboard' ? activeIndex : null,
  });

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
          </defs>
          <g clipPath={`url(#subnav-clip-${uid})`}>
            {/* opaque card fill */}
            <path d={outerPath} fill="var(--color-cream)" />
            {/* base fill for specific rows (e.g., warning yellow for sign out before hover) */}
            {ready &&
              ITEMS.map((item, i) =>
                item.key === 'signOut' ? (
                  <path
                    key={`base-${item.key}`}
                    d={rowRegion(i, ITEMS.length, boundaries, w, h, pad)}
                    fill="color-mix(in oklch, var(--color-yellow) 25%, var(--color-cream))"
                  />
                ) : null
              )
            }
            {/* the ink: spreads from the pointer (or the keyboard row's centre) */}
            {ready && (
              <RowInkWash
                uid={`subnav-${uid}`}
                ink={ink}
                boundaries={boundaries}
                w={w}
                h={h}
                pad={pad}
                fills={INK_WASHES}
              />
            )}
          </g>
          {/* wavy dividers — drawn past the edges, clipped flush to the border */}
          {ready &&
            boundaries.map((pts, i) => (
              <path
                key={i}
                d={dividerPath(pts)}
                fill="none"
                stroke="oklch(60% 0.04 60 / 0.45)"
                strokeWidth={INK_LIGHT}
                strokeLinecap="round"
                clipPath={`url(#subnav-clip-${uid})`}
              />
            ))}
          {/* outer stroke */}
          <path
            d={outerPath}
            fill="none"
            stroke="var(--field-border-hover)"
            strokeWidth={INK}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div id={`${uid}-menu`} className={styles.list} role="menu" aria-label={label('me')}>
        {ITEMS.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            id={`${uid}-opt-${i}`}
            className={styles.option}
            data-active={i === ink.index || undefined}
            data-tone={item.tone}
            disabled={item.key === 'signOut' && signingOut}
            aria-busy={(item.key === 'signOut' && signingOut) || undefined}
            onClick={() => onChoose(i)}
            {...ink.rowProps(i, () => {
              onActivate(i);
              setInteractionMode('mouse');
            })}
          >
            {/* Signing out: the row keeps its words, its icon's place draws the pen loop (B6). */}
            {item.key === 'signOut' && signingOut ? (
              <span className={styles.optionIcon}>
                <ButtonLoader size={18} />
              </span>
            ) : (
              <Icon name={item.icon} size={18} strokeWidth={INK} className={styles.optionIcon} />
            )}
            <span className={styles.optionLabel}>{label(item.key)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
