'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import { cardKey } from './cardPrefill';

/**
 * What this browser may hold that shows which card answers which, once one
 * of the viewer's cards starts or stops resonating with `targetId`: the
 * original's「共振 / 已共振」button, both cards' pages (the lists around
 * them, and the card itself, which carries `referenceCardId`), the card box's
 * published and resonated shelves, and the thought map.
 */
export function resonanceKeys(uid: string, targetId: string, card: { id: string; slug?: string }): string[] {
  return [
    `myResonance:${targetId}:${uid}`,
    `cardPage:${targetId}:${uid}`,
    `cardPage:${card.id}:${uid}`,
    cardKey(card.id, uid),
    ...(card.slug && card.slug !== card.id ? [cardKey(card.slug, uid)] : []),
    `cardbox:${uid}:published`,
    `cardbox:${uid}:resonated`,
    `thoughtmap:${uid}`,
  ];
}

/**
 * Reads again everything {@link resonanceKeys} names, after the server
 * pointed one of the viewer's cards at another card or took it back. Only
 * what is cached is read again; the rest is read when it is next shown.
 */
export function useResonanceRefresh(): (targetId: string, card: { id: string; slug?: string }) => void {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const uid = user?.id;
  return useCallback(
    (targetId, card) => {
      if (!uid) return;
      for (const key of resonanceKeys(uid, targetId, card)) void mutate(key);
    },
    [mutate, uid],
  );
}
