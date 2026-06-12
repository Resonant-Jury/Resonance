'use client';

import { useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CardEditor, type CardEditorProps } from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { Icon } from '@/components/atoms/Icon';
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
 * are written *next to* the knowledge they grow out of. Below 1200px the map
 * pane steps aside and only the editor remains.
 */
export function WriteWorkspace({ title, locale, initial, referenceCardId }: WriteWorkspaceProps) {
  const t = useTranslations('me');
  const railRef = useRef<HTMLDivElement>(null);
  const { h: railH } = useElementSize(railRef);
  // ~1 turning point per 130px keeps the long rule calm, not noodly.
  const railSteps = Math.max(5, Math.round(railH / 130));

  return (
    <div className={styles.workspace}>
      <div className={styles.editorCol}>
        <PageTitle>{title}</PageTitle>
        <CardEditor initial={initial} locale={locale} referenceCardId={referenceCardId} />
      </div>

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

      <aside className={styles.mapCol}>
        <div className={styles.mapSticky}>
          <h2 className={styles.mapHeading}>
            <Icon name="cards" size={18} /> {t('tabs.thoughtMap')}
          </h2>
          <ThoughtMapBoard height="calc(100vh - var(--app-header-h) - 110px)" />
        </div>
      </aside>
    </div>
  );
}
