'use client';

import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  maxWidth?: number;
  seed?: number;
  fillColor?: string;
  borderColor?: string;
  padding?: CSSProperties['padding'];
  ariaLabel?: string;
}

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
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { w, h } = useElementSize(ref, 0, 0, [open]);
  const R = 26;
  const mag = Math.min(w, h) * 0.025;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

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
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      className={styles.backdrop}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
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
          strokeWidth={1.8}
          segmentsH={[3, 4]} segmentsV={[5, 6]}
          curve={0.6} cornerJitter={0.9} cornerOffset={5}
        />
        <button onClick={onClose} aria-label="Close" className={styles.closeBtn}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4,4.2 C7,6.4 11.8,7.2 13.8,13.9" />
            <path d="M13.9,4.1 C11.6,7 7.1,10.2 4.1,13.8" />
          </svg>
        </button>
        <div className={styles.content}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
