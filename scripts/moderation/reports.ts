/**
 * Moderation queue for reports (檢舉). Reports are write-only for clients, so
 * this Admin SDK script is how they get read and closed.
 *
 *   npm run moderation -- list                 open reports, oldest first
 *   npm run moderation -- list --all           every report
 *   npm run moderation -- resolve <id> "note"  mark handled, with a note
 *
 * Add `--emulator` to run against the local emulators instead of production
 * (credentials come from .env otherwise).
 */
import 'dotenv/config';
import { emulatorEnv, EMULATOR_PROJECT_ID } from '../emulator-env.mjs';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const positional = args.filter((a) => !a.startsWith('--'));
const [command = 'list', ...rest] = positional;

async function main() {
  if (useEmulator) Object.assign(process.env, emulatorEnv);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const projectId = useEmulator ? EMULATOR_PROJECT_ID : process.env.FIREBASE_PROJECT_ID;
  const app = useEmulator
    ? initializeApp({ projectId }, 'moderation')
    : initializeApp(
        {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        },
        'moderation',
      );
  const db = getFirestore(app);

  if (command === 'list') {
    let q = db.collection('reports').orderBy('createdAt', 'asc');
    if (!args.includes('--all')) q = q.where('status', '==', 'open');
    const snap = await q.get();
    if (snap.empty) {
      console.log('No reports.');
      return;
    }
    for (const d of snap.docs) {
      const r = d.data();
      const when = r.createdAt?.toDate?.().toISOString() ?? '?';
      console.log(
        `${d.id}  ${when}  [${r.status}]  ${r.reason}  ${r.targetType}:${r.targetId}` +
          `  against ${r.targetUserId}  by ${r.reporterId}` +
          (r.contextId ? `  (context ${r.contextId})` : '') +
          (r.detail ? `\n    “${r.detail}”` : ''),
      );
    }
    return;
  }

  if (command === 'resolve') {
    const [id, note = ''] = rest;
    if (!id) throw new Error('Usage: resolve <reportId> "note"');
    await db.collection('reports').doc(id).update({
      status: 'resolved',
      resolvedAt: FieldValue.serverTimestamp(),
      resolutionNote: note,
    });
    console.log(`Resolved ${id}.`);
    return;
  }

  throw new Error(`Unknown command "${command}" (use list | resolve)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
