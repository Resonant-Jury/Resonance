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
 *       config/storage ← R2_PUBLIC_BASE's host (the rules then hold covers and avatars to it);
 *       the host it replaces, and those of R2_FORMER_PUBLIC_BASES, stay taken as formerHosts
 *   npx tsx scripts/backfill.ts rekey-images  [--apply] [--delete-old] [--emulator]
 *       anonymous cards' pictures under keys that name no one (needs R2 credentials to apply)
 *   npx tsx scripts/backfill.ts rehost-images [--apply] [--emulator]
 *       stored pictures' URLs on a former base (R2_FORMER_PUBLIC_BASES) → the same key on R2_PUBLIC_BASE
 *   npx tsx scripts/backfill.ts notes         [--apply] [--emulator]
 *       notes left before notes went into the thread → a `kind: 'note'` message in the two people's
 *       conversation (never on an anonymous card; no unread counted; opens a missing conversation,
 *       which may be one its people had deleted — production runs are the owner's call)
 *   npx tsx scripts/backfill.ts anonymous-bells [--apply] [--emulator]
 *       bells of a note or resonance on an anonymous card say so (`payload.anonymous`), as new ones do:
 *       they open the card, never a thread with whoever wrote the note or resonance
 *   npx tsx scripts/backfill.ts link-previews [--apply] [--emulator]
 *       published cards get the previews of their stories' standalone links (fetches the pages;
 *       --apply against production needs LINK_PREVIEW_SECRET or FIREBASE_PRIVATE_KEY — the deployment's —
 *       to sign their pictures)
 *
 * Production credentials come from .env; `--emulator` runs against the local
 * emulators (EMULATOR_FIRESTORE_PORT etc., see scripts/emulator-env.mjs) and
 * never touches R2 (rekey-images copies nothing there, it only reports).
 */
import 'dotenv/config';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';
import { formerPublicBases } from '../src/lib/storage/publicUrl';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const apply = args.includes('--apply');
const [task] = args.filter((a) => !a.startsWith('--'));

async function main() {
  // Before anything reads the environment: the emulator's must win over .env's.
  // On the emulator, a stand-in storage base when none is set.
  const publicBase = useEmulator ? (process.env.R2_PUBLIC_BASE ?? 'https://img.resonance.test') : process.env.R2_PUBLIC_BASE;
  const formerBases = formerPublicBases({ R2_PUBLIC_BASE: publicBase, R2_FORMER_PUBLIC_BASES: process.env.R2_FORMER_PUBLIC_BASES });
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
      await setStorageHost(db, publicBase, { apply, formerBases });
      return;
    }
    case 'rekey-images': {
      const { rekeyAnonymousImages } = await import('./backfills/rekeyImages');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      // On the emulator nothing reaches R2: report only.
      const storage = !useEmulator && apply ? new (await import('../src/lib/storage/r2')).R2StorageProvider() : null;
      await rekeyAnonymousImages(db, storage, { apply: apply && !useEmulator, deleteOld: args.includes('--delete-old'), publicBase });
      return;
    }
    case 'rehost-images': {
      const { rehostImages } = await import('./backfills/rehostImages');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      // Nothing in R2 moves (every key is served by both hosts): only the URLs in Firestore.
      await rehostImages(db, { apply, publicBase, formerBases });
      return;
    }
    case 'notes': {
      const { backfillNotes } = await import('./backfills/notes');
      await backfillNotes(db, { apply });
      return;
    }
    case 'anonymous-bells': {
      const { backfillAnonymousBells } = await import('./backfills/anonymousBells');
      await backfillAnonymousBells(db, { apply });
      return;
    }
    case 'link-previews': {
      // The pictures' paths are signed by this process: with a key the deployment doesn't have, they 404.
      const source = process.env.LINK_PREVIEW_SECRET?.trim()
        ? 'LINK_PREVIEW_SECRET'
        : process.env.FIREBASE_PRIVATE_KEY?.trim()
          ? 'a key derived from FIREBASE_PRIVATE_KEY'
          : null;
      if (apply && !useEmulator && !source) {
        throw new Error('Set LINK_PREVIEW_SECRET (or FIREBASE_PRIVATE_KEY) as the deployment has it: the pictures would be signed with a key it does not know.');
      }
      console.log(`pictures signed with ${source ?? 'the development key (emulators only)'}`);
      const { backfillLinkPreviews } = await import('./backfills/linkPreviews');
      await backfillLinkPreviews(db, { apply });
      return;
    }
    default:
      throw new Error(`Unknown task "${task ?? ''}" (anonymous | handles | edits | storage-host | rekey-images | rehost-images | notes | anonymous-bells | link-previews)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
