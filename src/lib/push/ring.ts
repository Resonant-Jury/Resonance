import { after } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { pushNotification } from './send';

/**
 * A bell row to ring: its id, or the work that writes it — run after the
 * response too, answering the row's id, or null when it rang no one.
 */
export type Bell = string | null | undefined | (() => Promise<string | null>);

/**
 * After the response, push each new bell row — never delaying or failing the
 * write that made it. Every bell row is written by the server (the rules let
 * no client create one), and its writer rings it here. Work that writes a
 * row (a resonance's reach, after the change that made it reachable) runs
 * here as well, before its push; one that fails is logged and rings no one,
 * and the next still rings.
 */
export function ringAfter(db: Firestore, ...bells: Bell[]) {
  const todo = bells.filter((b): b is NonNullable<Bell> => !!b);
  if (!todo.length) return;
  after(async () => {
    for (const bell of todo) {
      const id = typeof bell === 'string' ? bell : await bell().catch((e) => (console.error('[push]', e), null));
      if (!id) continue;
      await getAdminMessaging()
        .then((messaging) => pushNotification(db, id, messaging))
        .catch((e) => console.error('[push]', id, e));
    }
  });
}
