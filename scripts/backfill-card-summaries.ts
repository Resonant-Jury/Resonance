/**
 * Store the list summary (excerpt + read time, see src/lib/api/v1/summary.ts)
 * on published cards that don't have a current one: cards published before
 * publishing stored it, and cards whose story the web editor rewrote from the
 * browser since. Lists work without it (they read those cards' stories); this
 * makes them read less. Safe to run again: it only writes what is due, each
 * write conditional on the card being unchanged since it was read.
 *
 *   npx tsx scripts/backfill-card-summaries.ts                 dry run: count what is due, change nothing
 *   npx tsx scripts/backfill-card-summaries.ts --write         write the due summaries
 *   npx tsx scripts/backfill-card-summaries.ts --write --all   restate every published card's summary
 *
 * Add `--emulator` to run against the local emulators (EMULATOR_FIRESTORE_PORT
 * picks a private pair) instead of production (credentials come from .env).
 */
import 'dotenv/config';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const write = args.includes('--write');
const all = args.includes('--all');

async function main() {
  if (useEmulator) Object.assign(process.env, emulatorEnv);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { backfillCardSummaries } = await import('../src/lib/api/v1/summaryBackfill');

  const projectId = useEmulator ? EMULATOR_PROJECT_ID : process.env.FIREBASE_PROJECT_ID;
  const app = useEmulator
    ? initializeApp({ projectId }, 'backfill-card-summaries')
    : initializeApp(
        {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        },
        'backfill-card-summaries',
      );
  const db = getFirestore(app);

  console.log(`${write ? 'Writing' : 'Dry run (no writes; add --write)'} — project ${projectId}${useEmulator ? ' (emulator)' : ''}${all ? ', every published card' : ''}`);
  const report = await backfillCardSummaries(db, { write, all, log: (line) => console.log(line) });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
