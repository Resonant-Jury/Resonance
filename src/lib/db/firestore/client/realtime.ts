'use client';

import {
  collection,
  connectFirestoreEmulator,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type WhereFilterOp,
} from 'firebase/firestore';
import {
  EMULATOR_FIRESTORE_PORT,
  USE_FIREBASE_EMULATOR,
  getFirebaseClientApp,
  getFirebaseClientAuth,
} from '@/lib/auth/firebase/client';

/*
 * The full Firestore SDK, for the one thing Lite can't do: listen. It is only
 * ever imported dynamically (messages.ts' listeners, notifications.ts'), so it
 * loads after a page — once the header of a signed-in page starts listening
 * for its badges, or a thread opens — never with it. Everything else reads
 * and writes through Lite (./init, ./sdk) — a separate instance of the same
 * app.
 *
 * Its snapshots carry the full SDK's own Timestamp class, not Lite's: map
 * them with a check that accepts either (see messages.ts).
 */

let cached: Firestore | null = null;

function realtimeDb(): Firestore {
  if (cached) return cached;
  getFirebaseClientAuth(); // the listener signs in with the same user (see ./init)
  cached = initializeFirestore(getFirebaseClientApp(), { ignoreUndefinedProperties: true });
  if (USE_FIREBASE_EMULATOR) connectFirestoreEmulator(cached, '127.0.0.1', EMULATOR_FIRESTORE_PORT);
  return cached;
}

export interface ListenedDoc {
  id: string;
  data: DocumentData;
}

/** About one answer of a listener. */
export interface ListenedMeta {
  /**
   * The answer came from the SDK's own memory, not from the server (offline,
   * or before the server has answered): it may be only part of the truth.
   */
  fromCache: boolean;
}

/** A `where` clause, as the rules require of a list (the viewer's own documents). */
export interface ListenFilter {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

/**
 * Listen to the newest `max` documents of a collection by `field`, newest
 * first (those matching `filters`). Returns the unsubscribe function.
 */
export function listenNewest(
  path: [string, ...string[]],
  field: string,
  max: number,
  onDocs: (docs: ListenedDoc[], meta: ListenedMeta) => void,
  onError: (err: Error) => void,
  filters: ListenFilter[] = [],
): () => void {
  const [first, ...rest] = path;
  const q = query(
    collection(realtimeDb(), first, ...rest),
    ...filters.map((f) => where(f.field, f.op, f.value)),
    orderBy(field, 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => onDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() })), { fromCache: snap.metadata.fromCache }),
    (err) => onError(err),
  );
}
