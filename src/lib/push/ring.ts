import { after } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { pushNotification } from './send';

/** After the response, push each new bell row — never delaying or failing the write that made it. */
export function ringAfter(db: Firestore, ...ids: (string | null | undefined)[]) {
  const todo = ids.filter((id): id is string => !!id);
  if (!todo.length) return;
  after(async () => {
    for (const id of todo) {
      await pushNotification(db, id, getAdminMessaging()).catch((e) => console.error('[push]', id, e));
    }
  });
}

/** How long after writing a bell row the web may still ask for its push. */
export const RING_WINDOW_MS = 10 * 60 * 1000;

/**
 * The web still writes some bell rows from the browser (a resonance it
 * published, a conversation's first message, an accepted invite, a card
 * link), then asks for their push. Only the row's sender may ask, and only
 * while it is fresh — so no one can buzz a person with someone else's row or
 * an old one; pushNotification's claim makes each ring once-only.
 */
export async function assertRingable(db: Firestore, uid: string, id: string, now = Date.now()) {
  const snap = await db.doc(`notifications/${id}`).get();
  if (!snap.exists || snap.get('payload.fromUserId') !== uid) throw new ApiFailure('not_found', 'No such notification.');
  const created = snap.get('createdAt')?.toMillis?.() as number | undefined;
  if (!created || now - created > RING_WINDOW_MS) throw new ApiFailure('forbidden', 'This notification is too old to push.');
}
