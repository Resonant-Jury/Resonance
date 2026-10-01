'use client';

/*
 * Firestore Lite as the client modules use it: everything 'firebase/firestore/lite'
 * exports, with its reads and writes keeping two promises the full SDK made.
 *
 * Writes land in the order they were made. The full SDK sent them down one
 * ordered stream; Lite sends each as its own request, so two quick writes to
 * one document — a card dragged twice on the map, a draft's autosave beside
 * its publish — could otherwise arrive the other way round.
 *
 * A read sees this browser's earlier writes. The full SDK laid writes still in
 * flight over what the server sent back; a Lite read waits for them instead,
 * so leaving the editor or the map and reading the card box or the map again
 * never shows the state from before the last change.
 *
 * A failed write doesn't hold up later reads or writes. Transactions read
 * through their own `tx.get`, never through the reads here (which would wait
 * on the transaction itself).
 */

import * as lite from 'firebase/firestore/lite';

export * from 'firebase/firestore/lite';

let writes: Promise<unknown> = Promise.resolve();

/** Run a write once every write started before it has settled. */
function inOrder<T>(write: () => Promise<T>): Promise<T> {
  const run = writes.then(write, write);
  writes = run.catch(() => undefined);
  return run;
}

/** Run a read once every write started so far has settled. */
function afterWrites<T>(read: () => Promise<T>): Promise<T> {
  return writes.then(read);
}

export const getDoc: typeof lite.getDoc = (reference) => afterWrites(() => lite.getDoc(reference));

export const getDocs: typeof lite.getDocs = (query) => afterWrites(() => lite.getDocs(query));

export const setDoc = ((...args: Parameters<typeof lite.setDoc>) =>
  inOrder(() => (lite.setDoc as (...a: typeof args) => Promise<void>)(...args))) as typeof lite.setDoc;

export const updateDoc = ((...args: Parameters<typeof lite.updateDoc>) =>
  inOrder(() => (lite.updateDoc as (...a: typeof args) => Promise<void>)(...args))) as typeof lite.updateDoc;

export const deleteDoc: typeof lite.deleteDoc = (reference) => inOrder(() => lite.deleteDoc(reference));

export const addDoc: typeof lite.addDoc = (reference, data) => inOrder(() => lite.addDoc(reference, data));

export const runTransaction: typeof lite.runTransaction = (firestore, updateFunction, options) =>
  inOrder(() => lite.runTransaction(firestore, updateFunction, options));

/** A batch whose commit takes its turn with the other writes. */
export function writeBatch(firestore: lite.Firestore): lite.WriteBatch {
  const batch = lite.writeBatch(firestore);
  const ordered: lite.WriteBatch = {
    set: ((...args: unknown[]) => {
      (batch.set as (...a: unknown[]) => unknown)(...args);
      return ordered;
    }) as lite.WriteBatch['set'],
    update: ((...args: unknown[]) => {
      (batch.update as (...a: unknown[]) => unknown)(...args);
      return ordered;
    }) as lite.WriteBatch['update'],
    delete: (documentRef) => {
      batch.delete(documentRef);
      return ordered;
    },
    commit: () => inOrder(() => batch.commit()),
  } as lite.WriteBatch;
  return ordered;
}
