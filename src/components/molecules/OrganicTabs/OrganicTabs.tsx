'use client';

import { useMemo, type ReactNode } from 'react';
import { wavyLine } from '@/lib/design/wavyPath';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import styles from './OrganicTabs.module.css';

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
  /** Base seed so each tab's wobble is deterministic but distinct. */
  seed?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * Hand-drawn tab strip. Horizontal mode underlines the active tab with a wavy
 * pen stroke; vertical mode (e.g. settings nav) wraps the active item in a
 * wobbly tinted surface. Use for any in-page tab/section switcher so the
 * indicator matches the organic visual language.
 */
export function OrganicTabs<K extends string = string>({
  tabs,
  active,
  onChange,
  orientation = 'horizontal',
  seed = 5,
  className,
  'aria-label': ariaLabel,
}: OrganicTabsProps<K>) {
  const underline = useMemo(() => wavyLine(100, seed, 1.6, 5), [seed]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={[styles.list, styles[orientation], className].filter(Boolean).join(' ')}
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
              {orientation === 'horizontal' && isActive && (
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
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </span>
          </button>
        );

        if (orientation === 'vertical' && isActive) {
          return (
            <HandDrawnDashedSurface
              key={tab.key}
              seed={seed + tab.key.length * 7}
              R={12}
              strokeWidth={1.8}
              strokeColor="var(--color-terracotta)"
              fillColor="oklch(92% 0.05 55 / 0.45)"
              className={styles.activeSurface}
            >
              {button}
            </HandDrawnDashedSurface>
          );
        }
        return button;
      })}
    </div>
  );
}
