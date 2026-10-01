'use client';

import { doc, getDocs, limit as fsLimit, orderBy, query, serverTimestamp, updateDoc, where, collection } from './sdk';
import type { Notification } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { listenLazily } from './listen';

/** A Timestamp from either SDK (Lite's for a read, the full SDK's for the bell's listener), a Date, or an ISO string. */
function tsToDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate(): Date }).toDate();
  if (typeof value === 'string') return new Date(value);
  return null;
}

function mapNotification(id: string, data: Record<string, unknown>): Notification {
  return {
    id,
    userId: String(data.userId),
    type: data.type as Notification['type'],
    payload: (data.payload as Record<string, unknown>) ?? {},
    readAt: tsToDate(data.readAt),
    createdAt: tsToDate(data.createdAt) ?? new Date(0),
  };
}

export async function listNotifications(maxItems = 20): Promise<Notification[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'notifications'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      fsLimit(maxItems),
    ),
  );
  return snap.docs.map((d) => mapNotification(d.id, d.data()));
}

/**
 * Subscribe to the viewer's newest notifications (newest first): the bell's
 * badge and list, live — a row the server writes, or one marked read, shows
 * without a reload. Returns the unsubscribe function.
 */
export function listenNotifications(
  uid: string,
  onItems: (items: Notification[]) => void,
  onError?: (err: Error) => void,
  max = 20,
): () => void {
  return listenLazily(
    ({ listenNewest }) =>
      listenNewest(
        ['notifications'],
        'createdAt',
        max,
        (docs) => onItems(docs.map((d) => mapNotification(d.id, d.data))),
        (err) => onError?.(err),
        [{ field: 'userId', op: '==', value: uid }],
      ),
    onError,
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), 'notifications', id), {
    readAt: serverTimestamp(),
  });
}
