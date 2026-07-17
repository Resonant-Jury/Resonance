'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { OriginalCardPanel } from '@/components/sections/WriteWorkspace/OriginalCardPanel';
import { WorkspaceShell } from '@/components/sections/WriteWorkspace/WorkspaceShell';
import type { Card, Locale } from '@/lib/db/types';
import styles from '@/components/sections/WriteWorkspace/WriteWorkspace.module.css';

type Pane = { kind: 'editor'; card: Card } | { kind: 'card'; cardId: string } | null;

/**
 * The standalone thought-map page, in the unified workspace shell: the map
 * opens full bleed;「開啟卡片」slides the right pane in — a draft opens its
 * editor, a published card opens the reading panel — and ✕ hands the whole
 * viewport back to the map.
 */
export function ThoughtMapPage() {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const [pane, setPane] = useState<Pane>(null);

  return (
    <WorkspaceShell
      open={pane != null}
      onClose={() => setPane(null)}
      onOpenCard={(card: Card) =>
        setPane(
          card.publishedAt ? { kind: 'card', cardId: card.id } : { kind: 'editor', card },
        )
      }
    >
      {pane?.kind === 'card' && <OriginalCardPanel cardId={pane.cardId} />}
      {pane?.kind === 'editor' && (
        <div className={styles.editorCol}>
          <PageTitle>{t('editTitle')}</PageTitle>
          <CardEditor
            key={pane.card.id}
            locale={locale}
            referenceCardId={pane.card.referenceCardId}
            initial={{
              id: pane.card.id,
              thoughtCore: pane.card.thoughtCore,
              story: pane.card.story,
              tags: pane.card.tags,
              visibility: pane.card.visibility,
              media: pane.card.media,
              anonymous: pane.card.anonymous,
            }}
          />
        </div>
      )}
    </WorkspaceShell>
  );
}
