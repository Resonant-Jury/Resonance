'use client';

import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { useAuth } from '@/components/providers/AuthProvider';
import { getPendingCardEdit } from '@/lib/db/firestore/client/cardEdits';
import { OriginalCardPanel } from './OriginalCardPanel';
import type { Card, Locale } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

/**
 * A card opened from the map, rendered in the right pane: the viewer's own
 * cards (draft or published) open straight into their editor — the map already
 * holds the full card, so no loading pass — while resonated cards by another
 * author open as the reading panel (you can't edit someone else's card).
 *
 * A published card still needs one read: its pending-edit buffer. Everything
 * the editor decides about a live card (autosave goes to the buffer, the
 * primary action becomes 儲存修改) hangs off `publishedAt` + that buffer, and
 * the editor reads `initial` exactly once — so the pane waits for it rather
 * than mounting an editor that would write straight through to readers.
 */
export function OpenedCardPane({ card }: { card: Card }) {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const isOwn = user?.id === card.authorId;
  const { data: pending, isLoading } = useSWR(
    isOwn && card.publishedAt ? `pendingEdit:${card.id}` : null,
    () => getPendingCardEdit(card.id)
  );

  if (!isOwn) return <OriginalCardPanel cardId={card.id} />;

  if (isLoading) {
    return (
      <div className={styles.editorCol} aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <SketchLoader />
      </div>
    );
  }

  // Buffered edits win over the live fields — that is the copy being worked on.
  const values = pending ?? card;
  return (
    <div className={styles.editorCol}>
      <PageTitle>{card.publishedAt ? t('editPublishedTitle') : t('editTitle')}</PageTitle>
      <CardEditor
        key={card.id}
        locale={locale}
        referenceCardId={card.referenceCardId}
        initial={{
          id: card.id,
          slug: card.slug,
          publishedAt: card.publishedAt,
          hasPendingEdit: pending != null,
          thoughtCore: values.thoughtCore,
          story: values.story,
          tags: values.tags,
          visibility: values.visibility,
          media: values.media,
          accentHue: values.accentHue ?? undefined,
          anonymous: values.anonymous,
        }}
      />
    </div>
  );
}
