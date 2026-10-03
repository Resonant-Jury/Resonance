import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { Card } from '@/lib/db/types';
import { ApiFailure } from './http';
import { visibleCard } from './reads';
import type { CreateReportInput, ReportCardInput } from './schemas';

/**
 * Reports (檢舉), filed through the server. Each is the same `reports/{id}`
 * document the clients once wrote themselves (so `npm run moderation` reads
 * old and new alike), plus — written in the same batch — what it was about
 * as it stood at that moment, in server-only `reportEvidence/{id}`: the card,
 * the profile, or the reported message with the ones before it. Deleting or
 * editing the content afterwards (a card, a whole conversation) erases no
 * evidence. Evidence is purged with either person's account
 * (lib/account/deletion).
 */
export const EVIDENCE = 'reportEvidence';

/** How many messages before a reported one its evidence keeps. */
export const MESSAGE_CONTEXT = 20;

const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

interface Filed {
  targetType: 'card' | 'user' | 'message';
  targetId: string;
  targetUserId: string;
  contextId?: string;
  reason: string;
  detail: string;
}

/** Write the report and its evidence together; the report's id. */
async function file(db: Firestore, reporterId: string, report: Filed, evidence: DocumentData): Promise<string> {
  const ref = db.collection('reports').doc();
  const batch = db.batch();
  batch.set(ref, {
    reporterId,
    targetType: report.targetType,
    targetId: report.targetId,
    targetUserId: report.targetUserId,
    reason: report.reason,
    detail: report.detail,
    ...(report.contextId ? { contextId: report.contextId } : {}),
    createdAt: FieldValue.serverTimestamp(),
    status: 'open',
  });
  batch.set(db.doc(`${EVIDENCE}/${ref.id}`), {
    reportId: ref.id,
    reporterId,
    targetType: report.targetType,
    targetId: report.targetId,
    targetUserId: report.targetUserId,
    capturedAt: FieldValue.serverTimestamp(),
    ...evidence,
  });
  await batch.commit();
  return ref.id;
}

/** A profile as moderation needs to see it (what it showed when reported). */
function profileEvidence(u: DocumentData | undefined): DocumentData {
  return {
    handle: str(u?.handle),
    bio: str(u?.bio),
    avatarUrl: str(u?.avatarUrl),
    region: str(u?.region),
  };
}

function cardEvidence(card: Card, authorHandle: string | null): DocumentData {
  return {
    card: {
      id: card.id,
      slug: card.slug ?? null,
      thoughtCore: String(card.thoughtCore ?? ''),
      story: String(card.story ?? ''),
      tags: Array.isArray(card.tags) ? card.tags : [],
      media: card.media?.url ? { type: card.media.type ?? 'image', url: card.media.url, label: card.media.label ?? null } : null,
      visibility: card.visibility,
      anonymous: card.anonymous === true,
      referenceCardId: card.referenceCardId ?? null,
      publishedAt: card.publishedAt && !Number.isNaN(card.publishedAt.getTime()) ? card.publishedAt.toISOString() : null,
      authorHandle,
    },
  };
}

/**
 * A report on a card. The app never learns an anonymous card's author, so
 * the server fills targetUserId in. Only cards the reporter can see — a
 * hidden or unknown card is not_found, like reading it.
 */
export async function reportCard(db: Firestore, reporterId: string, key: string, input: ReportCardInput): Promise<string> {
  const card = await visibleCard(db, reporterId, key);
  if (card.authorId === reporterId) throw new ApiFailure('invalid_request', 'You cannot report your own card.');
  const author = card.authorId && !card.authorId.includes('/') ? await db.doc(`users/${card.authorId}`).get() : null;
  return file(
    db,
    reporterId,
    { targetType: 'card', targetId: card.id, targetUserId: card.authorId, reason: input.reason, detail: input.detail ?? '' },
    cardEvidence(card, str(author?.get('handle'))),
  );
}

/**
 * A report on a person (their profile) or on a message sent to the
 * reporter. A message must be in a conversation the reporter is part of, and
 * someone else's; its evidence is the message and up to
 * {@link MESSAGE_CONTEXT} before it, as they read then. Reporting the
 * conversation itself (`targetId` = its id) reports the other person, with
 * its latest messages.
 */
export async function createReport(db: Firestore, reporterId: string, input: CreateReportInput): Promise<string> {
  const detail = input.detail ?? '';
  if (input.targetType === 'user') {
    if (input.targetId === reporterId) throw new ApiFailure('invalid_request', 'You cannot report yourself.');
    const person = await db.doc(`users/${input.targetId}`).get();
    if (!person.exists) throw new ApiFailure('not_found', 'No such person.');
    return file(
      db,
      reporterId,
      { targetType: 'user', targetId: person.id, targetUserId: person.id, reason: input.reason, detail },
      { profile: profileEvidence(person.data()) },
    );
  }

  const conversationId = input.conversationId;
  if (!conversationId) throw new ApiFailure('invalid_request', 'A message report names its conversation.');
  const conversation = db.doc(`conversations/${conversationId}`);
  const messages = conversation.collection('messages');
  // `targetId` is one message — or the conversation itself (the web's thread
  // menu reports the conversation as a whole, from the other person).
  const whole = input.targetId === conversationId;
  const [convo, message] = await Promise.all([conversation.get(), whole ? null : messages.doc(input.targetId).get()]);
  const participants = convo.get('participants');
  // Someone else's conversation is as absent as a missing one.
  if (!convo.exists || !Array.isArray(participants) || !participants.includes(reporterId) || (message && !message.exists)) {
    throw new ApiFailure('not_found', 'No such message.');
  }
  const sender = message ? String(message.get('senderId') ?? '') : String(participants.find((p) => p !== reporterId) ?? '');
  if (!sender || sender === reporterId) throw new ApiFailure('invalid_request', 'You cannot report your own message.');
  const sentAt = message?.get('sentAt');
  const before = message
    ? sentAt instanceof Timestamp
      ? await messages.where('sentAt', '<', sentAt).orderBy('sentAt', 'desc').limit(MESSAGE_CONTEXT).get()
      : null
    : await messages.orderBy('sentAt', 'desc').limit(MESSAGE_CONTEXT).get();
  const toEvidence = (id: string, m: DocumentData) => ({
    id,
    senderId: str(m.senderId),
    text: str(m.text) ?? '',
    sentAt: iso(m.sentAt),
    ...(typeof m.cardRef === 'string' ? { cardRef: m.cardRef } : {}),
    ...(m.noteRef && typeof m.noteRef === 'object' ? { noteRef: m.noteRef } : {}),
    // A note carried into the thread (`kind: 'note'`, its card in cardRef): what the reported words were left on.
    ...(typeof m.kind === 'string' ? { kind: m.kind } : {}),
  });
  const sent = await db.doc(`users/${sender}`).get();
  return file(
    db,
    reporterId,
    { targetType: 'message', targetId: message?.id ?? conversationId, targetUserId: sender, contextId: conversationId, reason: input.reason, detail },
    {
      message: message ? toEvidence(message.id, message.data()!) : null,
      // Oldest first: the messages just before the reported one, or (the
      // whole conversation reported) its latest.
      context: (before?.docs ?? []).reverse().map((d) => toEvidence(d.id, d.data())),
      senderHandle: str(sent.get('handle')),
    },
  );
}
