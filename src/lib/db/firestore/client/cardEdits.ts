'use client';

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from './sdk';
import type { CardMedia, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { callApi } from './api';
import { isAbsent } from './errors';

/**
 * Pending edits to an **already-published** card.
 *
 * A draft autosaves straight onto its card document — nobody can read it yet.
 * A published card cannot: readers are looking at that document right now, so
 * autosaving into it would push every half-written sentence live. Instead the
 * editor autosaves the whole working copy into `cards/{id}/edits/current`
 * (owner-only by rules), and the server merges it into the live fields when
 * the author explicitly saves. Discarding is a plain delete.
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
  } catch (e) {
    // Not the owner (rules deny) reads as "no pending edit". A failed read
    // throws: an editor opened on the live fields instead would autosave them
    // over the working copy.
    if (isAbsent(e)) return null;
    throw e;
  }
}

/**
 * Autosave target for a published card — replaces the whole working copy. It
 * carries its author, so the account purge finds it even if its card is gone.
 */
export async function savePendingCardEdit(
  cardId: string,
  values: CardEditValues
): Promise<void> {
  const uid = requireUid();
  await setDoc(editRef(cardId), { ...values, authorId: uid, updatedAt: serverTimestamp() });
}

/** Throw the working copy away; the live card is left exactly as it was. */
export async function discardPendingCardEdit(cardId: string): Promise<void> {
  requireUid();
  await deleteDoc(editRef(cardId));
}

/** What applying answers (POST /api/v1/cards/{id}/edits/apply). */
export interface AppliedCardEdit {
  id: string;
  /** Where the card lives: its English slug, or null (it is served at its id). */
  slug: string | null;
  /** False when there was no working copy to apply — nothing changed. */
  applied: boolean;
}

/**
 * Make the working copy the live card, through the server (the call the apps
 * make): in one transaction it copies what `edits/current` holds onto the
 * card, held to a card's limits, and deletes the buffer, so a reader never
 * sees half of a revision. `publishedAt` and the slug are left alone — an
 * edit must not re-date a card (every feed orders by it) or move it. List
 * excerpts, the cached pages and the recommendation index follow on the
 * server. It applies the buffer, not the screen: save the working copy first.
 */
export async function applyPendingCardEdit(cardId: string): Promise<AppliedCardEdit> {
  requireUid();
  return callApi<AppliedCardEdit>(`/api/v1/cards/${encodeURIComponent(cardId)}/edits/apply`, { method: 'POST' });
}
