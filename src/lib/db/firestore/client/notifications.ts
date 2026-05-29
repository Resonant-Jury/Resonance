'use client';

import {
  collection,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Notification } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

function tsToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return null;
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

export async function unreadNotificationCount(): Promise<number> {
  const items = await listNotifications(50);
  return items.filter((n) => n.readAt === null).length;
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), 'notifications', id), {
    readAt: serverTimestamp(),
  });
}
