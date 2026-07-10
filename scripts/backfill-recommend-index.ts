/**
 * Backfill the recommendation vector index for published cards that were never
 * indexed (cards published before the recommender shipped, or whose fire-and-
 * forget publish-time indexing failed). Idempotent — re-running re-extracts
 * signatures and re-upserts vectors.
 *
 * Also clears the per-user daily `recommendations` cache so the next feed
 * request regenerates against the freshly indexed corpus.
 *
 * Usage (from the repo root, needs OPENAI + FIREBASE_* admin creds in .env):
 *   npx tsx -r dotenv/config scripts/backfill-recommend-index.ts          # only unindexed cards
 *   npx tsx -r dotenv/config scripts/backfill-recommend-index.ts --all    # reindex everything
 */
import { getAdminDb } from '../src/lib/db/firestore/admin';
import { indexCard } from '../src/lib/recommend/indexCard';

async function main() {
  const reindexAll = process.argv.includes('--all');
  const db = getAdminDb();

  const snap = await db.collection('cards').where('publishedAt', '!=', null).get();
  const targets = snap.docs.filter((d) => reindexAll || d.data().indexedAt == null);
  console.log(`published cards: ${snap.size}, to index: ${targets.length}`);

  for (const doc of targets) {
    try {
      const result = await indexCard(doc.id);
      console.log(`  ${doc.id}: ${result.indexed ? `indexed (${result.channels} channels)` : `skipped (${result.reason})`}`);
    } catch (err) {
      console.error(`  ${doc.id}: FAILED`, err);
    }
  }

  // Drop every cached daily feed so readers pick up the new corpus on next load.
  const recs = await db.collection('recommendations').get();
  await Promise.all(recs.docs.map((d) => d.ref.delete()));
  console.log(`cleared ${recs.size} cached recommendation feed(s)`);
}

main().then(() => process.exit(0));
