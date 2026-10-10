'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import modalStyles from '@/components/molecules/Modal/Modal.module.css';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicSlider } from '@/components/atoms/OrganicSlider/OrganicSlider';
import { Icon } from '@/components/atoms/Icon';
import { avatarWobPath } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';
import {
  CROP_MASK_INSET,
  CROP_STAGE_MAX,
  CROP_START,
  CROP_ZOOM_MAX,
  CROP_ZOOM_MIN,
  CROP_ZOOM_STEP,
  KEY_PAN,
  KEY_PAN_FAST,
  KEY_ZOOM,
  WHEEL_ZOOM,
  cropRect,
  cropScale,
  cropStage,
  panView,
  zoomView,
  type CropView,
} from '@/lib/images/avatarCrop';
import { renderCrop, type CropSource } from '@/lib/images/avatarCropImage';
import styles from './AvatarCropModal.module.css';

export interface AvatarCropModalProps {
  /** The decoded picture; the modal is open while there is one. */
  source: CropSource | null;
  /** Cancel, the backdrop or Escape (none of them while the photo is on its way). */
  onCancel: () => void;
  /** The framed square (a JPEG): resolves once it is uploaded and saved, rejects when that failed. */
  onUse: (blob: Blob) => Promise<void>;
}

/** The scrim over the picture outside the mask (the avatar dropzone's wash). */
const SCRIM = 'oklch(30% 0.02 70 / 0.5)';
/** The avatar's shape (HandDrawnAvatar's seed in settings) and the stage's paper outline (HandDrawnImage's recipe). */
const MASK_SEED = 77;
const STAGE_SEED = 79;

type Point = { x: number; y: number };

/**
 * Framing a new profile photo before it goes up (round 5, B7) — our own
 * dialog, the same on the web and in both apps: the picture under the
 * avatar's own outline, dimmed outside it, dragged to move, pinched, wheeled
 * or slid to zoom; what shows inside the outline is exactly the avatar.
 * 使用 crops the square, uploads it and saves it (the caller's `onUse`),
 * its loader running meanwhile; Cancel leaves everything as it was.
 *
 * The view is kept in units of the mask's diameter (`avatarCrop` works the
 * same at any scale), so a resize of the stage keeps the framing.
 */
export function AvatarCropModal({ source, onCancel, onUse }: AvatarCropModalProps) {
  const t = useTranslations('settings.profile');
  const [view, setView] = useState<CropView>(CROP_START);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new picture starts unzoomed and centred.
  useEffect(() => {
    setView(CROP_START);
    setBusy(false);
    setFailed(false);
  }, [source]);

  const roomRef = useRef<HTMLDivElement>(null);
  const { w: room } = useElementSize(roomRef, 0, 0, [source]);
  const { stage, mask } = cropStage(room > 0 ? room : CROP_STAGE_MAX);
  const img = useMemo(() => (source ? { width: source.width, height: source.height } : null), [source]);

  // The picture itself: the decoded canvas, placed by the view.
  const holderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const holder = holderRef.current;
    if (!source || !holder) return;
    source.canvas.className = styles.picture;
    holder.appendChild(source.canvas);
    return () => {
      if (source.canvas.parentNode === holder) holder.removeChild(source.canvas);
    };
  }, [source, stage]);

  const stageRef = useRef<HTMLDivElement>(null);
  /** A pointer's place from the mask's centre, in units of its diameter. */
  const toUnits = useCallback(
    (clientX: number, clientY: number): Point => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box || mask <= 0) return { x: 0, y: 0 };
      return { x: (clientX - box.left - stage / 2) / mask, y: (clientY - box.top - stage / 2) / mask };
    },
    [mask, stage],
  );

  const pan = useCallback(
    (dx: number, dy: number) => img && setView((v) => panView(img, 1, v, dx, dy)),
    [img],
  );
  const zoom = useCallback(
    (z: (current: number) => number, anchor?: Point) => img && setView((v) => zoomView(img, 1, v, z(v.z), anchor)),
    [img],
  );

  // Drag to move; two fingers pinch (and move) about their centroid.
  const pointers = useRef(new Map<number, Point>());
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (busy || !img) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, toUnits(e.clientX, e.clientY));
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const map = pointers.current;
    const before = map.get(e.pointerId);
    if (!before || busy) return;
    const now = toUnits(e.clientX, e.clientY);
    if (map.size === 1) {
      map.set(e.pointerId, now);
      pan(now.x - before.x, now.y - before.y);
      return;
    }
    const [a, b] = Array.from(map.entries()).slice(0, 2);
    const other = a[0] === e.pointerId ? b[1] : a[1];
    map.set(e.pointerId, now);
    const c0 = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
    const c1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
    const d0 = Math.hypot(before.x - other.x, before.y - other.y);
    const d1 = Math.hypot(now.x - other.x, now.y - other.y);
    pan(c1.x - c0.x, c1.y - c0.y);
    if (d0 > 0 && d1 > 0) zoom((z) => (z * d1) / d0, c1);
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
  }

  // A wheel or a trackpad's pinch zooms about the pointer, and never scrolls the page under the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (busy) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoom((z) => z * Math.exp(-dy * WHEEL_ZOOM), toUnits(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [busy, zoom, toUnits, source]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (busy || mask <= 0) return;
    const step = (e.shiftKey ? KEY_PAN_FAST : KEY_PAN) / mask;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      pan(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoom((z) => z * KEY_ZOOM);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoom((z) => z / KEY_ZOOM);
    }
  }

  async function use() {
    if (!source || !img || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onUse(await renderCrop(source, cropRect(img, 1, view)));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const stagePath = useMemo(
    () =>
      stage > 0
        ? wobRect(stage, stage, 16, STAGE_SEED, autoMag(stage, stage), {
            segmentsH: autoSegments(stage),
            segmentsV: autoSegments(stage),
            curve: autoCurve(stage, stage),
          })
        : '',
    [stage],
  );
  const maskPath = useMemo(() => (mask > 0 ? avatarWobPath(mask, MASK_SEED) : ''), [mask]);

  // Where the picture is drawn: its centre (ox, oy) from the mask's centre, at scale s.
  const s = img ? cropScale(img, mask, view.z) : 1;
  const placed = img
    ? {
        width: img.width,
        height: img.height,
        transform: `translate(${stage / 2 + view.ox * mask - (img.width * s) / 2}px, ${
          stage / 2 + view.oy * mask - (img.height * s) / 2
        }px) scale(${s})`,
      }
    : undefined;
  const inset = CROP_MASK_INSET;

  return (
    <Modal open={source != null} onClose={busy ? undefined : onCancel} maxWidth={400} seed={59} ariaLabel={t('cropTitle')}>
      <h3 className={styles.title}>{t('cropTitle')}</h3>
      <p className={styles.hint}>{t('cropHint')}</p>

      <div ref={roomRef} className={styles.room}>
        <div
          ref={stageRef}
          className={styles.stage}
          style={{ width: stage, height: stage }}
          role="group"
          aria-label={t('cropStage')}
          tabIndex={0}
          data-busy={busy || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <div
            className={styles.paper}
            style={stagePath ? { clipPath: `path('${stagePath}')`, WebkitClipPath: `path('${stagePath}')` } : undefined}
          >
            <div ref={holderRef} className={styles.holder} style={placed} />
            {maskPath && (
              <svg className={styles.overlay} width={stage} height={stage} viewBox={`0 0 ${stage} ${stage}`} aria-hidden>
                <g transform={`translate(${inset} ${inset})`}>
                  <path
                    d={`M${-inset} ${-inset}H${stage - inset}V${stage - inset}H${-inset}Z ${maskPath}`}
                    fill={SCRIM}
                    fillRule="evenodd"
                  />
                  <path
                    d={maskPath}
                    fill="none"
                    stroke="var(--color-cream)"
                    strokeOpacity={0.9}
                    strokeWidth={INK}
                    strokeLinejoin="round"
                    data-crop-mask=""
                  />
                </g>
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className={styles.zoom}>
        <Icon name="minus" size={16} className={styles.zoomGlyph} />
        <div className={styles.slider}>
          <OrganicSlider
            value={view.z}
            min={CROP_ZOOM_MIN}
            max={CROP_ZOOM_MAX}
            step={CROP_ZOOM_STEP}
            ariaLabel={t('cropZoom')}
            disabled={busy}
            onChange={(z) => zoom(() => z)}
          />
        </div>
        <Icon name="plus" size={16} className={styles.zoomGlyph} />
      </div>

      {failed && (
        <p className={`${modalStyles.error} ${styles.error}`} role="alert">
          {t('avatarError')}
        </p>
      )}

      <div className={styles.foot}>
        <ModalActions busy={busy}>
          <OrganicButton variant="tonal" size="sm" onClick={onCancel} disabled={busy}>
            {t('cropCancel')}
          </OrganicButton>
          <OrganicButton variant="solid" size="sm" onClick={() => void use()} loading={busy}>
            {t('cropUse')}
          </OrganicButton>
        </ModalActions>
      </div>
    </Modal>
  );
}
