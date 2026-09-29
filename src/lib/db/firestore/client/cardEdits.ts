'use client';

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import type { Card, CardMedia, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { clearedMedia } from './cards';
import { mapCard } from './map';

/**
 * Pending edits to an **already-published** card.
 *
 * A draft autosaves straight onto its card document — nobody can read it yet.
 * A published card cannot: readers are looking at that document right now, so
 * autosaving into it would push every half-written sentence live. Instead the
 * editor autosaves the whole working copy into `cards/{id}/edits/current`
 * (owner-only by rules) and only merges it into the live fields when the
 * author explicitly saves. Discarding is a plain delete.
 *
 * The buffer never carries `publishedAt`: applying an edit updates a card, it
 * does not re-publish it.
 */

/** Everything the editor can change about a card. */
export interface CardEditValues {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  media?: CardMedia;
  accentHue?: number | null;
  anonymous: boolean;
}

export interface PendingCardEdit extends CardEditValues {
  /** When autosave last wrote the buffer (null until the server stamp lands). */
  updatedAt: Date | null;
}

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function editRef(cardId: string) {
  return doc(getClientDb(), 'cards', cardId, 'edits', 'current');
}

/** The author's unsaved working copy, or null when there is none. */
export async function getPendingCardEdit(cardId: string): Promise<PendingCardEdit | null> {
  try {
    const snap = await getDoc(editRef(cardId));
    if (!snap.exists()) return null;
    const data = snap.data();
    const stamp = data.updatedAt;
    return {
      thoughtCore: String(data.thoughtCore ?? ''),
      story: String(data.story ?? ''),
      tags: (data.tags as string[]) ?? [],
      visibility: (data.visibility as Visibility) ?? 'public',
      media: data.media as CardMedia | undefined,
      accentHue: typeof data.accentHue === 'number' ? data.accentHue : null,
      anonymous: data.anonymous === true,
      updatedAt: stamp instanceof Timestamp ? stamp.toDate() : null,
    };
  } catch {
    // Not the owner (rules deny) reads as "no pending edit".
    return null;
  }
}

/** Autosave target for a published card — replaces the whole working copy. */
export async function savePendingCardEdit(
  cardId: string,
  values: CardEditValues
): Promise<void> {
  requireUid();
  await setDoc(editRef(cardId), { ...values, updatedAt: serverTimestamp() });
}

/** Throw the working copy away; the live card is left exactly as it was. */
export async function discardPendingCardEdit(cardId: string): Promise<void> {
  requireUid();
  await deleteDoc(editRef(cardId));
}

/**
 * Publish the working copy into the live card: one batch writes the fields and
 * clears the buffer, so a reader never sees a card that still advertises
 * unsaved changes. `publishedAt` is deliberately untouched — an edit must not
 * re-date the card (every feed orders by it).
 */
export async function applyPendingCardEdit(
  cardId: string,
  values: CardEditValues
): Promise<Card> {
  requireUid();
  const db = getClientDb();
  const ref = doc(db, 'cards', cardId);
  const batch = writeBatch(db);
  batch.set(ref, { ...values, ...clearedMedia(values), updatedAt: serverTimestamp() }, { merge: true });
  batch.delete(editRef(cardId));
  await batch.commit();
  const snap = await getDoc(ref);
  return mapCard(snap.id, snap.data() ?? {});
}
