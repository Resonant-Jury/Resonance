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

/** SWR keys held per viewer, ending in their uid (`{kind}:{what}:{uid}`), whose answers turn on whom they are connected with. */
const PER_VIEWER = ['card:', 'cardPage:', 'profilePage:', 'relation:'];

/**
 * Whether an SWR key holds something that turns on the viewer's connections —
 * what a resonance can start and taking one back can end: whether they are
 * connected with someone (a thread's composer, the card page's「傳訊息」), a
 * thread's conversation (whose waiting letter is someone's turn again once
 * the two aren't), the people the messages page lists, a profile's standing
 * and the cards it shows them, and every card a connection lets them read —
 * a connections-only card's page and the lists around card pages, and the
 * card box's shelves.
 */
export function dependsOnConnections(uid: string): (key: unknown) => boolean {
  return (key) =>
    typeof key === 'string' &&
    (key.startsWith('connected:') ||
      key.startsWith('conversation:') ||
      key === `conversations:${uid}` ||
      key.startsWith(`cardbox:${uid}:`) ||
      (PER_VIEWER.some((kind) => key.startsWith(kind)) && key.endsWith(`:${uid}`)));
}

/**
 * Reads again everything {@link resonanceKeys} names, after the server
 * pointed one of the viewer's cards at another card or took it back — and,
 * since that can start or end a connection with the original's author,
 * everything that {@link dependsOnConnections}. Only what is cached is read
 * again; the rest is read when it is next shown.
 */
export function useResonanceRefresh(): (targetId: string, card: { id: string; slug?: string }) => void {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const uid = user?.id;
  return useCallback(
    (targetId, card) => {
      if (!uid) return;
      const named = new Set(resonanceKeys(uid, targetId, card));
      const connections = dependsOnConnections(uid);
      // One pass, so a key both name is read again once.
      void mutate((key) => (typeof key === 'string' && named.has(key)) || connections(key));
    },
    [mutate, uid],
  );
}

/**
 * After a take-back that went by another way — one of the viewer's published
 * resonances deleted, made private, connections-only or anonymous (the card
 * ⋯, the editor's applied changes): the connection with the original's
 * author may have ended with it, so what {@link dependsOnConnections} is read
 * again, with `also` (a caller's own keys) in the same pass.
 */
export function useConnectionRefresh(): (also?: (key: string) => boolean) => void {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const uid = user?.id;
  return useCallback(
    (also) => {
      if (!uid) return;
      const connections = dependsOnConnections(uid);
      void mutate((key) => connections(key) || (typeof key === 'string' && !!also?.(key)));
    },
    [mutate, uid],
  );
}
