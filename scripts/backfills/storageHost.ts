import type { Firestore } from 'firebase-admin/firestore';

/**
 * config/storage → { host }: the storage's public host, which firestore.rules
 * (`storedFile`) holds every new cover and avatar to, so neither can be a
 * picture — a tracking pixel — somewhere else. Until this document exists the
 * rules take any https URL. Taken from R2_PUBLIC_BASE, the base the server
 * stores under.
 */
export async function setStorageHost(db: Firestore, publicBase: string | undefined, opts: { apply: boolean; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set: there is no storage host to name');
  const host = new URL(publicBase).host;
  const current = (await db.doc('config/storage').get()).get('host');
  log(`storage host: ${host} (now: ${current ?? 'not set — any https URL is taken'})`);
  if (opts.apply && current !== host) {
    await db.doc('config/storage').set({ host }, { merge: true });
    log('set');
  }
  return { host, previous: current ?? null };
}
