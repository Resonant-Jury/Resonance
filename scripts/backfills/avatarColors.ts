import { FieldPath, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { avatarColorFor, LEGACY_AVATAR_COLOR } from '../../src/lib/design/avatarColors';

const PAGE = 500;

/**
 * Profiles made before avatar colours were given out all wear the one colour
 * (LEGACY_AVATAR_COLOR) or none: each gets its own, picked by uid as a new
 * profile's is (createProfile → avatarColorFor), so one person's face reads
 * apart from another's. A profile already wearing any other colour is left as
 * it is; only `accentColor` is written (never a photo, the pen name or a date).
 * A uid whose colour is the old one keeps it.
 *
 * Idempotent; with `apply: false` it only counts.
 */
export async function backfillAvatarColors(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  const changes: { ref: DocumentReference; color: string }[] = [];
  let scanned = 0;
  let after: string | null = null;
  for (;;) {
    let page = db.collection('users').orderBy(FieldPath.documentId()).select('accentColor').limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    scanned += snap.size;
    for (const d of snap.docs) {
      const current = d.get('accentColor');
      const unset = typeof current !== 'string' || !current.trim() || current.trim() === LEGACY_AVATAR_COLOR;
      if (!unset) continue;
      const color = avatarColorFor(d.id);
      if (color !== current) changes.push({ ref: d.ref, color });
    }
    if (snap.size < PAGE) break;
    after = snap.docs[snap.size - 1].id;
  }
  log(`profiles: ${scanned}, wearing the one colour everyone did (or none) and given their own: ${changes.length}`);
  if (!opts.apply || !changes.length) return { scanned, recolored: 0, missing: changes.length };

  const writer = db.bulkWriter();
  for (const c of changes) void writer.update(c.ref, { accentColor: c.color });
  await writer.close();
  log(`recoloured ${changes.length} profile(s)`);
  return { scanned, recolored: changes.length, missing: changes.length };
}
