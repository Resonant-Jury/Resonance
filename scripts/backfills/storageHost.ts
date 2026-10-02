import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * config/storage → { host, formerHosts? }: the storage's public host, which
 * firestore.rules (`storedFile`) holds every new cover and avatar to, so
 * neither can be a picture — a tracking pixel — somewhere else. Until this
 * document exists the rules take any https URL. Taken from R2_PUBLIC_BASE,
 * the base the server stores under.
 *
 * Moving the storage to a new host (the bucket then served by both), the host
 * this replaces joins `formerHosts`, with those of R2_FORMER_PUBLIC_BASES:
 * pictures stored before still name an old host, and a draft or pending edit
 * holding one must stay saveable. The list only grows here (no duplicates,
 * never the current host); retire a host by removing it from the document
 * by hand, once `rehost-images` has left nothing on it.
 */
export async function setStorageHost(
  db: Firestore,
  publicBase: string | undefined,
  opts: { apply: boolean; formerBases?: readonly string[]; log?: (line: string) => void },
) {
  const log = opts.log ?? console.log;
  if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set: there is no storage host to name');
  const host = new URL(publicBase).host;
  const snap = await db.doc('config/storage').get();
  const current: unknown = snap.get('host');
  const listed: unknown = snap.get('formerHosts');
  const before = Array.isArray(listed) ? listed.filter((h): h is string => typeof h === 'string') : [];
  const formerHosts = [
    ...new Set([
      ...before,
      ...(typeof current === 'string' && current ? [current] : []),
      ...(opts.formerBases ?? []).map((base) => new URL(base).host),
    ]),
  ].filter((h) => h !== host);

  log(`storage host: ${host} (now: ${typeof current === 'string' ? current : 'not set — any https URL is taken'})`);
  log(`former hosts: ${formerHosts.join(', ') || 'none'}${before.length ? ` (now: ${before.join(', ')})` : ''}`);
  const unchanged = current === host && formerHosts.length === before.length && formerHosts.every((h, i) => h === before[i]);
  if (opts.apply && !unchanged) {
    await db.doc('config/storage').set(
      { host, formerHosts: formerHosts.length ? formerHosts : FieldValue.delete() },
      { merge: true },
    );
    log('set');
  }
  return { host, formerHosts, previous: typeof current === 'string' ? current : null };
}
