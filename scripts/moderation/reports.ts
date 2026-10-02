/**
 * Moderation queue for reports (檢舉). Reports are write-only for clients, so
 * this Admin SDK script is how they get read and closed.
 *
 *   npm run moderation -- list                 open reports, oldest first, with what each was about
 *   npm run moderation -- list --all           every report
 *   npm run moderation -- show <id>            one report and everything kept of what it was about
 *   npm run moderation -- resolve <id> "note"  mark handled, with a note
 *
 * What a report was about is kept as it read when it was filed
 * (reportEvidence/{id}, written by the server beside the report): the card,
 * the profile, or the reported message with the ones before it. Reports the
 * apps' older builds filed straight from the client have none.
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
    const evidence = await db.getAll(...snap.docs.map((d) => db.doc(`reportEvidence/${d.id}`)));
    snap.docs.forEach((d, i) => {
      const r = d.data();
      const when = r.createdAt?.toDate?.().toISOString() ?? '?';
      console.log(
        `${d.id}  ${when}  [${r.status}]  ${r.reason}  ${r.targetType}:${r.targetId}` +
          `  against ${r.targetUserId}  by ${r.reporterId}` +
          (r.contextId ? `  (context ${r.contextId})` : '') +
          (r.detail ? `\n    “${r.detail}”` : ''),
      );
      console.log(`    ${summarize(evidence[i].data())}`);
    });
    return;
  }

  if (command === 'show') {
    const [id] = rest;
    if (!id) throw new Error('Usage: show <reportId>');
    const [report, evidence] = await db.getAll(db.doc(`reports/${id}`), db.doc(`reportEvidence/${id}`));
    if (!report.exists) throw new Error(`No report ${id}`);
    console.log(JSON.stringify({ report: plain(report.data()), evidence: plain(evidence.data()) ?? null }, null, 2));
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

  throw new Error(`Unknown command "${command}" (use list | show | resolve)`);
}

/** One line on what a report kept of its subject (reportEvidence). */
function summarize(e: Record<string, unknown> | undefined): string {
  if (!e) return '(nothing kept: filed by an older app build, straight from the client)';
  const cut = (v: unknown, n = 80) => {
    const t = String(v ?? '').replace(/\s+/g, ' ');
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };
  const card = e.card as Record<string, unknown> | undefined;
  if (card) return `card “${cut(card.thoughtCore, 40)}” by ${card.authorHandle ?? '?'}${card.anonymous ? ' (anonymous)' : ''}: ${cut(card.story)}`;
  const profile = e.profile as Record<string, unknown> | undefined;
  if (profile) return `profile ${profile.handle ?? '?'}: ${cut(profile.bio)}`;
  const message = e.message as Record<string, unknown> | null | undefined;
  const context = (e.context as unknown[] | undefined) ?? [];
  if (message) return `message from ${e.senderHandle ?? message.senderId}: “${cut(message.text)}” (+${context.length} before it)`;
  return `conversation with ${e.senderHandle ?? '?'}: its last ${context.length} messages`;
}

/** Firestore values as plain JSON (timestamps as ISO strings). */
function plain(value: unknown): unknown {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
