'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { deleteCardDraft, updateCardDraft } from '@/lib/db/firestore/client/cards';
import { wobRect } from '@/lib/design/wobRect';
import { dividerPath, rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import type { Visibility } from '@/lib/db/types';
import styles from './CardActionsMenu.module.css';

export interface CardActionsMenuProps {
  card: { id: string; visibility: Visibility };
  /** Seed so the wobble of the trigger + dropped card is deterministic per card. */
  seed?: number;
  /** The accent hue of the card. If omitted, we derive it or default to 55. */
  hue?: number;
  /** Called after the visibility changed (the card-box cache is already revalidated). */
  onChanged?: () => void;
  /** Called after the card was deleted (e.g. navigate away from its detail page). */
  onDeleted?: () => void;
  className?: string;
}

type ActionKey = 'edit' | 'visibility' | 'delete';

/**
 * The owner-side「⋯」menu on a card: 編輯 / 轉為公開·私人 / 刪除. The trigger is
 * a small wobbly chip; the dropped menu reuses the Subnavbar's organic
 * language (wavy dividers via {@link rowBoundary}, per-row wash). Deleting
 * asks for confirmation in a {@link Modal} first. Mutations go through the
 * client card writes and then revalidate the viewer's card-box SWR key, so
 * the card visibly moves tabs / disappears without a reload.
 */
export function CardActionsMenu({
  card,
  seed = 7,
  hue,
  onChanged,
  onDeleted,
  className,
}: CardActionsMenuProps) {
  const t = useTranslations('me.actions');
  const router = useRouter();
  const { user } = useAuth();
  const { mutate } = useSWRConfig();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [panelSeed, setPanelSeed] = useState(seed);
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');

  const isPrivate = card.visibility === 'private';
  const items: { key: ActionKey; icon: IconName; label: string }[] = [
    { key: 'edit', icon: 'pen', label: t('edit') },
    { key: 'visibility', icon: isPrivate ? 'globe' : 'lock', label: isPrivate ? t('makePublic') : t('makePrivate') },
    { key: 'delete', icon: 'trash', label: t('delete') },
  ];

  const refreshBox = useCallback(() => {
    if (user) void mutate(`cardbox:${user.id}`);
  }, [mutate, user]);

  // Close on outside pointer-down.
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

  async function choose(key: ActionKey) {
    if (busy) return;
    if (key === 'edit') {
      setOpen(false);
      router.push(`/write/${card.id}`);
      return;
    }
    if (key === 'visibility') {
      setBusy(true);
      try {
        await updateCardDraft(card.id, { visibility: isPrivate ? 'public' : 'private' });
        refreshBox();
        onChanged?.();
        setOpen(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    // delete → confirm first
    setOpen(false);
    setConfirming(true);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCardDraft(card.id);
      refreshBox();
      setConfirming(false);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  const cardHue = hue ?? (seed && seed > 10 ? seed : 55);
  const cardBorder = `oklch(52% 0.11 ${cardHue})`;
  const cardBorderHover = `oklch(38% 0.09 ${cardHue})`;
  const cardCream = `oklch(98% 0.01 ${cardHue})`;
  const cardCreamDark = `oklch(93.5% 0.02 ${cardHue})`;

  return (
    <div
      ref={rootRef}
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      style={{
        '--card-border': cardBorder,
        '--card-border-hover': cardBorderHover,
        '--card-cream': cardCream,
        '--card-cream-dark': cardCreamDark,
      } as React.CSSProperties}
    >
      <button
        type="button"
        className={styles.trigger}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={t('menuLabel')}
        onClick={(e) => {
          // The trigger may sit over a Link-wrapped card — keep the click ours.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) {
              setPanelSeed(Math.floor(Math.random() * 10000));
            }
            return next;
          });
        }}
      >
        <HandDrawnBorder
          w={38}
          h={38}
          R={38 * 0.42}
          seed={seed}
          mag={38 * 0.03}
          fillColor="color-mix(in oklch, var(--card-cream) 90%, transparent)"
          strokeColor="var(--card-border)"
          strokeWidth={INK}
          segmentsH={1}
          segmentsV={1}
          curve={1.4}
          cornerJitter={2.4}
        />
        <span className={styles.triggerIcon}>
          <Icon name="dots" size={20} strokeWidth={2.0} />
        </span>
      </button>

      {open && (
        <ActionsPanel
          uid={uid}
          seed={panelSeed}
          hue={cardHue}
          items={items}
          busy={busy}
          onChoose={(key) => void choose(key)}
        />
      )}

      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        seed={seed + 5}
        maxWidth={400}
        ariaLabel={t('deleteConfirmTitle')}
      >
        <h3 className={styles.confirmTitle}>{t('deleteConfirmTitle')}</h3>
        <p className={styles.confirmBody}>{t('deleteConfirmBody')}</p>
        {/* OrganicButton has no disabled prop — gate via pointer-events while deleting. */}
        <div
          className={styles.confirmActions}
          style={busy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          <OrganicButton variant="ghost" onClick={() => setConfirming(false)}>
            {t('deleteCancel')}
          </OrganicButton>
          <OrganicButton variant="primary" onClick={() => void confirmDelete()}>
            {busy ? '…' : t('deleteConfirm')}
          </OrganicButton>
        </div>
      </Modal>
    </div>
  );
}

interface ActionsPanelProps {
  uid: string;
  seed: number;
  hue: number;
  items: { key: ActionKey; icon: IconName; label: string }[];
  busy: boolean;
  onChoose: (key: ActionKey) => void;
}

const ROW_H = 42;

function ActionsPanel({ uid, seed, hue, items, busy, onChoose }: ActionsPanelProps) {
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
  const dangerIndex = items.findIndex((it) => it.key === 'delete');

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
            <clipPath id={`cardactions-clip-${uid}`}>
              <path d={outerPath} />
            </clipPath>
          </defs>
          <g clipPath={`url(#cardactions-clip-${uid})`}>
            <path d={outerPath} fill="var(--card-cream)" />
            {/* warning wash under the delete row, before any hover */}
            {ready && dangerIndex >= 0 && (
              <path
                d={rowRegion(dangerIndex, items.length, boundaries, w, h, pad)}
                fill="color-mix(in oklch, var(--color-yellow) 25%, var(--card-cream))"
              />
            )}
            {/* hover wash for the active row */}
            {ready && hovered !== null && (
              <path
                d={rowRegion(hovered, items.length, boundaries, w, h, pad)}
                fill={
                  hovered === dangerIndex
                    ? 'color-mix(in oklch, var(--color-yellow) 45%, var(--card-cream))'
                    : 'color-mix(in oklch, var(--card-border-hover) 15%, transparent)'
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
                stroke={`oklch(55% 0.04 ${hue} / 0.4)`}
                strokeWidth={INK_LIGHT}
                strokeLinecap="round"
                clipPath={`url(#cardactions-clip-${uid})`}
              />
            ))}
          <path
            d={outerPath}
            fill="none"
            stroke="var(--card-border)"
            strokeWidth={INK}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div id={`${uid}-menu`} className={styles.list} role="menu">
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={styles.option}
            data-active={i === hovered || undefined}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChoose(item.key);
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((cur) => (cur === i ? null : cur))}
          >
            <Icon name={item.icon} size={17} strokeWidth={1.8} className={styles.optionIcon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
