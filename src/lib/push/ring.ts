import { after } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { pushNotification } from './send';

/**
 * After the response, push each new bell row — never delaying or failing the
 * write that made it. Every bell row is written by the server (the rules let
 * no client create one), and its writer rings it here.
 */
export function ringAfter(db: Firestore, ...ids: (string | null | undefined)[]) {
  const todo = ids.filter((id): id is string => !!id);
  if (!todo.length) return;
  after(async () => {
    for (const id of todo) {
      await pushNotification(db, id, getAdminMessaging()).catch((e) => console.error('[push]', id, e));
    }
  });
}
