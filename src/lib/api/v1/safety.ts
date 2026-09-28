import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from './http';
import { visibleCard } from './reads';
import type { ReportCardInput } from './schemas';

/**
 * A report on a card, written like the web's submitReport (the same fields,
 * so `npm run moderation` reads both alike). The app never learns an
 * anonymous card's author, so the server fills targetUserId in. Only cards
 * the reporter can see — a hidden or unknown card is not_found, like reading it.
 */
export async function reportCard(db: Firestore, reporterId: string, key: string, input: ReportCardInput): Promise<string> {
  const card = await visibleCard(db, reporterId, key);
  if (card.authorId === reporterId) throw new ApiFailure('invalid_request', 'You cannot report your own card.');
  const ref = db.collection('reports').doc();
  await ref.set({
    reporterId,
    targetType: 'card',
    targetId: card.id,
    targetUserId: card.authorId,
    reason: input.reason,
    detail: input.detail ?? '',
    createdAt: FieldValue.serverTimestamp(),
    status: 'open',
  });
  return ref.id;
}
