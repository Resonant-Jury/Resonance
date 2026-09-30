'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { wavyLine } from '@/lib/design/wavyPath';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './OrganicTabs.module.css';
import { INK_STRONG } from '@/lib/design/strokes';

export interface OrganicTabItem<K extends string = string> {
  key: K;
  label: ReactNode;
}

export interface OrganicTabsProps<K extends string = string> {
  tabs: OrganicTabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Horizontal tabs get a wavy underline; vertical get an organic highlight. */
  orientation?: 'horizontal' | 'vertical';
  /** Style variant for the active tab indicator: a wavy 'underline', or a 'surface' wash (no outline) behind the tab. Defaults to 'surface' for vertical and 'underline' for horizontal. */
  variant?: 'underline' | 'surface';
  /**
   * Horizontal only: keep every tab on one line and scroll sideways instead
   * of wrapping — the standard phone pattern for section switchers.
   */
  scrollable?: boolean;
  /** Base seed so each tab's wobble is deterministic but distinct. */
  seed?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * The selected tab's wash: a wobbly tinted fill behind the button with no pen
 * outline of its own — the same selected state as the native tab bar and the
 * editor toolbar. A tab is a control, not a container, so it is washed in
 * rather than framed (one frame per layer).
 */
function TabWash({
  seed,
  inline,
  children,
}: {
  seed: number;
  inline: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref);
  return (
    <span
      ref={ref}
      className={[styles.activeSurface, inline ? styles.inline : ''].filter(Boolean).join(' ')}
    >
      {/* No strokeColor: HandDrawnBorder then draws the fill path only. */}
      <HandDrawnBorder
        w={w}
        h={h}
        R={12}
        seed={seed}
        fillColor="color-mix(in oklch, var(--color-terracotta-light) 55%, transparent)"
      />
      <span className={styles.washContent}>{children}</span>
    </span>
  );
}

/**
 * Hand-drawn tab strip. Horizontal mode underlines the active tab with a wavy
 * pen stroke; vertical mode (e.g. settings nav) washes the active item with a
 * wobbly tinted fill — a wash only, no outline. Use for any in-page
 * tab/section switcher so the indicator matches the organic visual language.
 */
export function OrganicTabs<K extends string = string>({
  tabs,
  active,
  onChange,
  orientation = 'horizontal',
  variant,
  scrollable = false,
  seed = 5,
  className,
  'aria-label': ariaLabel,
}: OrganicTabsProps<K>) {
  const underline = useMemo(() => wavyLine(100, seed, 1.6, 5), [seed]);
  const resolvedVariant = variant ?? (orientation === 'vertical' ? 'surface' : 'underline');

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={[
        styles.list,
        styles[orientation],
        scrollable && orientation === 'horizontal' ? styles.scrollable : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const button = (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={[styles.tab, isActive ? styles.active : ''].filter(Boolean).join(' ')}
          >
            <span className={styles.tabLabel}>
              {tab.label}
              {orientation === 'horizontal' && resolvedVariant === 'underline' && isActive && (
                <svg
                  className={styles.underline}
                  viewBox="0 -5 100 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d={underline}
                    fill="none"
                    stroke="var(--color-terracotta)"
                    strokeWidth={INK_STRONG}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </span>
          </button>
        );

        if (resolvedVariant === 'surface' && isActive) {
          return (
            <TabWash
              key={tab.key}
              seed={seed + tab.key.length * 7}
              inline={orientation === 'horizontal'}
            >
              {button}
            </TabWash>
          );
        }
        return button;
      })}
    </div>
  );
}
