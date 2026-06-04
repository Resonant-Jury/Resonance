'use client';

import type { CSSProperties, ReactNode } from 'react';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import styles from './Panel.module.css';

type Variant = 'default' | 'soft' | 'plain';

export interface PanelProps {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  variant?: Variant;
  /** On ≤720px, collapse Panel chrome so children read as plain sections. */
  collapseOnMobile?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Make Panel sticky in side-rail layout. */
  sticky?: boolean;
  stickyTop?: number | string;
  /** Seed for the wobbly dashed border (default variant only). */
  seed?: number;
}

export function Panel({
  children,
  title,
  eyebrow,
  footer,
  variant = 'default',
  collapseOnMobile = true,
  className,
  style,
  sticky,
  stickyTop = 'calc(var(--app-header-h) + 16px)',
  seed = 5,
}: PanelProps) {
  const inner = (
    <>
      {(eyebrow || title) && (
        <header className={styles.panelHeader}>
          {eyebrow && <div className={styles.panelEyebrow}>{eyebrow}</div>}
          {title && <h2 className={styles.panelTitle}>{title}</h2>}
        </header>
      )}
      {children}
      {footer && <footer className={styles.panelFooter}>{footer}</footer>}
    </>
  );

  const wrapperStyle: CSSProperties = {
    ...(sticky ? { position: 'sticky', top: stickyTop, alignSelf: 'start' } : null),
    ...style,
  };

  if (variant === 'default') {
    return (
      <div
        className={[styles.panel, className].filter(Boolean).join(' ')}
        data-collapse-mobile={collapseOnMobile || undefined}
        style={wrapperStyle}
      >
        <HandDrawnDashedSurface
          seed={seed}
          R={22}
          className={styles.surface}
        >
          <div className={styles.panelInner}>{inner}</div>
        </HandDrawnDashedSurface>
      </div>
    );
  }

  return (
    <div
      className={[styles.panel, className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-collapse-mobile={collapseOnMobile || undefined}
      style={wrapperStyle}
    >
      <div className={styles.panelInner}>{inner}</div>
    </div>
  );
}

export interface PanelSectionProps {
  children: ReactNode;
  title?: ReactNode;
  hint?: ReactNode;
}

/** A titled sub-section inside a Panel. Sibling sections should be
 * separated by `<Divider />` rather than another Panel. */
export function PanelSection({ children, title, hint }: PanelSectionProps) {
  return (
    <div className={styles.section}>
      {title && <p className={styles.sectionTitle}>{title}</p>}
      {hint && <p className={styles.sectionHint}>{hint}</p>}
      {children !== undefined && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}
