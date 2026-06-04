'use client';

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Comment } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function mapComment(id: string, data: Record<string, unknown>): Comment {
  return {
    id,
    cardId: String(data.cardId),
    authorId: String(data.authorId),
    parentId: (data.parentId as string | null) ?? null,
    body: String(data.body ?? ''),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0),
  };
}

/** All comments on a card, oldest first. */
export async function listComments(cardId: string): Promise<Comment[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'comments'),
      where('cardId', '==', cardId),
      orderBy('createdAt', 'asc'),
    ),
  );
  return snap.docs.map((d) => mapComment(d.id, d.data()));
}

export interface CommentTarget {
  /** uid of the card's author, who should be notified. */
  authorId: string;
  /** The commenter's handle, embedded in the notification payload. */
  fromHandle: string;
}

/**
 * Post a comment (one flat level — parentId is always null for now) and notify
 * the card's author in the same batch. Returns the new comment's id.
 */
export async function addComment(
  cardId: string,
  body: string,
  target: CommentTarget,
): Promise<string> {
  const uid = requireUid();
  const db = getClientDb();
  const batch = writeBatch(db);

  const commentRef = doc(collection(db, 'comments'));
  batch.set(commentRef, {
    cardId,
    authorId: uid,
    parentId: null,
    body,
    createdAt: serverTimestamp(),
  });

  if (target.authorId !== uid) {
    batch.set(doc(collection(db, 'notifications')), {
      userId: target.authorId,
      type: 'comment',
      payload: { fromUserId: uid, fromHandle: target.fromHandle, cardId },
      readAt: null,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
  return commentRef.id;
}
