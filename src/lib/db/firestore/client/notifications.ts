'use client';

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getClientDb } from './init';

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), 'notifications', id), {
    readAt: serverTimestamp(),
  });
}
