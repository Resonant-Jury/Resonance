/**
 * One-off data backfills for what the server and rules expect of older data.
 * Each only reports what it would do unless given `--apply`.
 *
 *   npx tsx scripts/backfill.ts anonymous     [--apply] [--emulator]
 *       every card gets a boolean `anonymous` (the public lists filter on it)
 *   npx tsx scripts/backfill.ts handles       [--apply] [--emulator]
 *       reserve every pen name (handles/{name}); duplicates are reported, not reserved
 *   npx tsx scripts/backfill.ts edits         [--apply] [--emulator]
 *       delete pending edits whose card is gone; name the author on the rest
 *   npx tsx scripts/backfill.ts storage-host  [--apply] [--emulator]
 *       config/storage ← R2_PUBLIC_BASE's host (the rules then hold covers and avatars to it)
 *   npx tsx scripts/backfill.ts rekey-images  [--apply] [--delete-old] [--emulator]
 *       anonymous cards' pictures under keys that name no one (needs R2 credentials to apply)
 *
 * Production credentials come from .env; `--emulator` runs against the local
 * emulators (EMULATOR_FIRESTORE_PORT etc., see scripts/emulator-env.mjs) and
 * never touches R2 (rekey-images copies nothing there, it only reports).
 */
import 'dotenv/config';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const apply = args.includes('--apply');
const [task] = args.filter((a) => !a.startsWith('--'));

async function main() {
  // Before anything reads the environment: the emulator's must win over .env's.
  const publicBase = process.env.R2_PUBLIC_BASE;
  if (useEmulator) Object.assign(process.env, emulatorEnv);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = useEmulator ? EMULATOR_PROJECT_ID : process.env.FIREBASE_PROJECT_ID;
  const app = useEmulator
    ? initializeApp({ projectId }, 'backfill')
    : initializeApp(
        {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        },
        'backfill',
      );
  const db = getFirestore(app);
  console.log(`${projectId}: ${task} (${apply ? 'applying' : 'dry run — add --apply to write'})`);

  switch (task) {
    case 'anonymous': {
      const { backfillAnonymous } = await import('./backfills/anonymous');
      await backfillAnonymous(db, { apply });
      return;
    }
    case 'handles': {
      const { backfillHandles } = await import('./backfills/handles');
      await backfillHandles(db, { apply });
      return;
    }
    case 'edits': {
      const { cleanUpEdits } = await import('./backfills/orphanEdits');
      await cleanUpEdits(db, { apply });
      return;
    }
    case 'storage-host': {
      const { setStorageHost } = await import('./backfills/storageHost');
      await setStorageHost(db, useEmulator ? (publicBase ?? 'https://img.resonance.test') : publicBase, { apply });
      return;
    }
    case 'rekey-images': {
      const { rekeyAnonymousImages } = await import('./backfills/rekeyImages');
      const base = useEmulator ? (publicBase ?? 'https://img.resonance.test') : publicBase;
      if (!base) throw new Error('R2_PUBLIC_BASE is not set');
      // On the emulator nothing reaches R2: report only.
      const storage = !useEmulator && apply ? new (await import('../src/lib/storage/r2')).R2StorageProvider() : null;
      await rekeyAnonymousImages(db, storage, { apply: apply && !useEmulator, deleteOld: args.includes('--delete-old'), publicBase: base });
      return;
    }
    default:
      throw new Error(`Unknown task "${task ?? ''}" (anonymous | handles | edits | storage-host | rekey-images)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
