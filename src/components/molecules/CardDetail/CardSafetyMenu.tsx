'use client';

import { useTranslations } from 'next-intl';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useSafetyActions } from '@/components/molecules/SafetyActions/useSafetyActions';
import { useMyBlockedIds } from '@/lib/data/hooks';

export interface CardSafetyMenuProps {
  card: { id: string; authorId: string; anonymous?: boolean };
  /** Author handle — omitted for anonymous cards so the dialogs never name them. */
  authorHandle?: string;
  seed?: number;
  hue?: number;
}

/**
 * The reader-side「⋯」on a card page (the owner gets CardActionsMenu in the
 * same slot): report this card, block its author.
 */
export function CardSafetyMenu({ card, authorHandle, seed = 7, hue }: CardSafetyMenuProps) {
  const t = useTranslations('safety');
  const { data: blocked } = useMyBlockedIds();
  const safety = useSafetyActions({
    report: {
      type: 'card',
      id: card.id,
      userId: card.authorId,
      handle: card.anonymous ? undefined : authorHandle,
    },
    isBlocked: blocked?.has(card.authorId) ?? false,
  });
  return (
    <>
      <OrganicMenu
        label={t('menuLabel')}
        seed={seed}
        hue={hue}
        items={safety.items}
        onChoose={(key) => safety.choose(key)}
      />
      {safety.modals}
    </>
  );
}
