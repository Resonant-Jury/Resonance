import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { extractInsightSignature } from '@/lib/ai/tasks';
import { embed } from '@/lib/ai/openai';
import { isIndexable, signatureToChannelTexts } from './signature';
import { getVectorStore } from './vectorStore';
import type { VectorRecord } from './vectorStore/types';

export interface IndexResult {
  indexed: boolean;
  reason?: 'not-published' | 'not-found' | 'low-insight';
  channels?: number;
}

/**
 * The write-time pipeline, run once per published card (idempotent): extract the
 * insight signature with one LLM call → store it back on the card → if the card
 * clears the insight bar, embed each channel and upsert its vectors; otherwise
 * remove any stale vectors so it leaves the candidate pool.
 *
 * Server-only (admin SDK + OpenAI key). This is where the system's cost lives —
 * O(cards), each once — so the read side can stay cheap.
 */
export async function indexCard(cardId: string): Promise<IndexResult> {
  const db = getAdminDb();
  const ref = db.collection('cards').doc(cardId);
  const snap = await ref.get();
  if (!snap.exists) return { indexed: false, reason: 'not-found' };

  const data = snap.data() ?? {};
  // Drafts carry no published signal yet — nothing to recommend.
  if (data.publishedAt == null) return { indexed: false, reason: 'not-published' };

  const signature = await extractInsightSignature({
    title: String(data.thoughtCore ?? ''),
    story: String(data.story ?? ''),
  });

  // Always persist the signature (powers the card page / future features) and
  // stamp the index time.
  await ref.set(
    { signature, indexedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const store = getVectorStore();

  if (!isIndexable(signature)) {
    // Below the insight bar (or edited down): make sure it isn't lingering in
    // the candidate pool from a previous, higher-scoring version.
    await store.deleteByCard(cardId);
    return { indexed: false, reason: 'low-insight' };
  }

  const channelTexts = signatureToChannelTexts(signature);
  const vectors = await embed(channelTexts.map((c) => c.text));

  const records: VectorRecord[] = channelTexts.map((c, i) => ({
    cardId,
    authorId: String(data.authorId),
    visibility: data.visibility ?? 'public',
    channel: c.channel,
    vector: vectors[i] ?? [],
    insightScore: signature.insightScore,
    coreInsight: signature.coreInsight,
    situation: signature.situation,
    lifeDomain: signature.lifeDomain,
  }));

  await store.upsert(records);
  return { indexed: true, channels: records.length };
}
