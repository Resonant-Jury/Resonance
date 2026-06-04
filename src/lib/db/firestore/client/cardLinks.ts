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
import type { CardLink } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function cardLinkId(sourceCardId: string, targetCardId: string): string {
  return `${sourceCardId}_${targetCardId}`;
}

function mapCardLink(id: string, data: Record<string, unknown>): CardLink {
  return {
    id,
    sourceCardId: String(data.sourceCardId),
    sourceAuthorId: String(data.sourceAuthorId),
    targetCardId: String(data.targetCardId),
    targetAuthorId: String(data.targetAuthorId),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0),
  };
}

export interface CreateCardLinkInput {
  /** One of the viewer's own cards. */
  sourceCardId: string;
  /** The card being linked to (the article being viewed). */
  targetCardId: string;
  /** uid of the target card's author (notified + denormalized for queries). */
  targetAuthorId: string;
  /** The viewer's handle, embedded in the notification payload. */
  fromHandle: string;
}

/**
 * Associate one of the viewer's cards with a target card, and notify the target
 * card's author. Doc id is deterministic so re-linking the same pair is a no-op
 * overwrite rather than a duplicate.
 */
export async function createCardLink(input: CreateCardLinkInput): Promise<string> {
  const uid = requireUid();
  const db = getClientDb();
  const batch = writeBatch(db);

  const linkRef = doc(db, 'cardLinks', cardLinkId(input.sourceCardId, input.targetCardId));
  batch.set(linkRef, {
    sourceCardId: input.sourceCardId,
    sourceAuthorId: uid,
    targetCardId: input.targetCardId,
    targetAuthorId: input.targetAuthorId,
    createdAt: serverTimestamp(),
  });

  if (input.targetAuthorId !== uid) {
    batch.set(doc(collection(db, 'notifications')), {
      userId: input.targetAuthorId,
      type: 'card_link',
      payload: {
        fromUserId: uid,
        fromHandle: input.fromHandle,
        sourceCardId: input.sourceCardId,
        cardId: input.targetCardId,
      },
      readAt: null,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
  return linkRef.id;
}

/** Links pointing at a single card (for the author's card-detail view). */
export async function listLinksToCard(cardId: string): Promise<CardLink[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cardLinks'),
      where('targetCardId', '==', cardId),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => mapCardLink(d.id, d.data()));
}

/** Links pointing at any card by a given author (for the profile "linked" tab). */
export async function listLinksToAuthor(authorId: string): Promise<CardLink[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cardLinks'),
      where('targetAuthorId', '==', authorId),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => mapCardLink(d.id, d.data()));
}
