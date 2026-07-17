'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { OriginalCardPanel } from './OriginalCardPanel';
import type { Card, Locale } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

/**
 * A card opened from the map, rendered in the right pane: the viewer's own
 * cards (draft or published) open straight into their editor — the map already
 * holds the full card, so no loading pass — while resonated cards by other
 * authors open as the reading panel (you can't edit someone else's card).
 */
export function OpenedCardPane({ card }: { card: Card }) {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const { user } = useAuth();

  if (user?.id !== card.authorId) return <OriginalCardPanel cardId={card.id} />;

  return (
    <div className={styles.editorCol}>
      <PageTitle>{t('editTitle')}</PageTitle>
      <CardEditor
        key={card.id}
        locale={locale}
        referenceCardId={card.referenceCardId}
        initial={{
          id: card.id,
          thoughtCore: card.thoughtCore,
          story: card.story,
          tags: card.tags,
          visibility: card.visibility,
          media: card.media,
          anonymous: card.anonymous,
        }}
      />
    </div>
  );
}
