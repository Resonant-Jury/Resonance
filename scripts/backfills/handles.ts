import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HANDLES, handleKey, reservable } from '../../src/lib/db/firestore/handles';

export interface HandleBackfillReport {
  users: number;
  /** Reservations written (or that would be, without `apply`). */
  reserved: string[];
  /** Already reserved by their own account. */
  alreadyReserved: number;
  /** Pen names more than one account goes by: `name: uid (joined), …`, earliest first. Not reserved — the owner decides. */
  duplicates: string[];
  /** Reserved by another account than the one going by it. */
  heldByAnother: string[];
  /** Names that can't be a reservation's id (`..`, `__x__`): those accounts must choose again. */
  unreservable: string[];
  /** Profiles whose `handleLower` doesn't match their pen name (fix through the server). */
  mismatched: string[];
}

/**
 * Reserve every existing pen name: handles/{name, lower-cased} → { uid,
 * handle } (lib/db/firestore/handles), as the profile writes do from now on.
 * A name more than one account goes by is reported, not reserved: which of
 * them keeps it (the earliest joined, by the audit's suggestion) is the
 * owner's call, and the others then choose again through PATCH /api/v1/me.
 *
 * Idempotent; with `apply: false` it only reports.
 */
export async function backfillHandles(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }): Promise<HandleBackfillReport> {
  const log = opts.log ?? console.log;
  const [users, existing] = await Promise.all([
    db.collection('users').select('handle', 'handleLower', 'joinedAt').get(),
    db.collection(HANDLES).get(),
  ]);
  const reservedBy = new Map(existing.docs.map((d) => [d.id, String(d.get('uid') ?? '')]));
  const byKey = new Map<string, { uid: string; handle: string; joined: number }[]>();
  const report: HandleBackfillReport = {
    users: users.size, reserved: [], alreadyReserved: 0, duplicates: [], heldByAnother: [], unreservable: [], mismatched: [],
  };
  for (const d of users.docs) {
    const handle = String(d.get('handle') ?? '').trim();
    if (!handle) continue;
    const key = handleKey(handle);
    if (d.get('handleLower') !== key) report.mismatched.push(`${d.id} (${JSON.stringify(d.get('handle'))})`);
    const joinedAt = d.get('joinedAt') as { toMillis?: () => number } | undefined;
    const joined = typeof joinedAt?.toMillis === 'function' ? joinedAt.toMillis() : Number.MAX_SAFE_INTEGER;
    byKey.set(key, [...(byKey.get(key) ?? []), { uid: d.id, handle, joined }]);
  }

  const writes: { key: string; uid: string; handle: string }[] = [];
  for (const [key, holders] of byKey) {
    if (!reservable(key)) {
      report.unreservable.push(`${key}: ${holders.map((h) => h.uid).join(', ')}`);
      continue;
    }
    if (holders.length > 1) {
      const sorted = [...holders].sort((a, b) => a.joined - b.joined);
      report.duplicates.push(`${key}: ${sorted.map((h) => `${h.uid} (${Number.isFinite(h.joined) && h.joined < Number.MAX_SAFE_INTEGER ? new Date(h.joined).toISOString() : 'no joinedAt'})`).join(', ')}`);
      continue;
    }
    const [only] = holders;
    const owner = reservedBy.get(key);
    if (owner === only.uid) report.alreadyReserved++;
    else if (owner) report.heldByAnother.push(`${key}: reserved by ${owner}, used by ${only.uid}`);
    else writes.push({ key, uid: only.uid, handle: only.handle });
  }
  report.reserved = writes.map((w) => w.key);

  log(`users: ${report.users}; to reserve: ${writes.length}; already reserved: ${report.alreadyReserved}`);
  const section = (title: string, lines: string[]) => {
    log(`${lines.length ? '✗' : '✓'} ${title}: ${lines.length}`);
    for (const line of lines.slice(0, 50)) log(`    ${line}`);
    if (lines.length > 50) log(`    … and ${lines.length - 50} more`);
  };
  section('pen names more than one account goes by (not reserved — choose who keeps each)', report.duplicates);
  section('names reserved by another account', report.heldByAnother);
  section("names that can't be reserved (those accounts choose again)", report.unreservable);
  section('profiles whose handleLower does not match the pen name', report.mismatched);

  if (opts.apply && writes.length) {
    const writer = db.bulkWriter();
    // create(): never over a reservation made meanwhile by a profile write.
    for (const w of writes) {
      void writer.create(db.collection(HANDLES).doc(w.key), { uid: w.uid, handle: w.handle, reservedAt: FieldValue.serverTimestamp() }).catch((e) => {
        log(`  ${w.key}: not reserved (${(e as Error).message})`);
      });
    }
    await writer.close();
    log(`reserved ${writes.length} name(s)`);
  }
  return report;
}
