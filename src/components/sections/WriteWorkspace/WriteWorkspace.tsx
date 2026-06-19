'use client';

import { useRef, type ReactNode } from 'react';
import { CardEditor, type CardEditorProps } from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wavyVertical } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';
import styles from './WriteWorkspace.module.css';

export interface WriteWorkspaceProps {
  title: ReactNode;
  locale: CardEditorProps['locale'];
  initial?: CardEditorProps['initial'];
  referenceCardId?: string;
}

/**
 * The write-mode workspace: editor on the left, the author's thought map on
 * the right, separated by a single wavy vertical pen stroke — so new cards
 * are written *next to* the knowledge they grow out of. On desktop the map is
 * a fixed, full-height pane that owns the entire right half of the screen, its
 * divider running edge-to-edge top to bottom. Below 1200px the map pane steps
 * aside and only the editor remains.
 */
export function WriteWorkspace({ title, locale, initial, referenceCardId }: WriteWorkspaceProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const { h: railH } = useElementSize(railRef);
  // ~1 turning point per 130px keeps the long rule calm, not noodly.
  const railSteps = Math.max(5, Math.round(railH / 130));

  return (
    <div className={styles.workspace}>
      <div className={styles.editorArea}>
        <div className={styles.editorCol}>
          <PageTitle>{title}</PageTitle>
          <CardEditor initial={initial} locale={locale} referenceCardId={referenceCardId} />
        </div>
      </div>

      <aside className={styles.mapCol}>
        <div ref={railRef} className={styles.rail} aria-hidden="true">
          {railH > 0 && (
            <svg
              className={`${styles.railSvg} res-shape-fade-in`}
              width={14}
              height={railH}
              viewBox={`0 0 14 ${railH}`}
              style={{ width: 14, height: railH }}
            >
              <path
                d={wavyVertical(railH, 83, 5, railSteps)}
                transform="translate(7,0)"
                stroke="var(--field-border)"
                strokeWidth={INK_LIGHT}
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
        <ThoughtMapBoard height="100%" flush />
      </aside>
    </div>
  );
}
