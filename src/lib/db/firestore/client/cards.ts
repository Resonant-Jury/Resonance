'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { Card, CardMedia, Locale, NewCard, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { mapCard } from './map';
import { callApi } from './api';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

export async function createCardDraft(input: {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  originalLocale: Locale;
  media?: CardMedia;
  /** Cover-image dominant hue, pre-snapped to the card palette (null = none). */
  accentHue?: number | null;
  referenceCardId?: string;
  anonymous?: boolean;
}): Promise<Card> {
  const uid = requireUid();
  const data: Omit<NewCard, 'translations'> & {
    translations: Card['translations'];
    publishedAt: null;
    readCount: 0;
    resonanceCount: 0;
    inviteCount: 0;
  } = {
    authorId: uid,
    thoughtCore: input.thoughtCore,
    story: input.story,
    tags: input.tags,
    visibility: input.visibility,
    originalLocale: input.originalLocale,
    media: input.media,
    accentHue: input.accentHue ?? undefined,
    referenceCardId: input.referenceCardId,
    anonymous: input.anonymous ?? false,
    translations: {},
    publishedAt: null,
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
  };
  const ref = await addDoc(collection(getClientDb(), 'cards'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return mapCard(snap.id, snap.data() ?? {});
}

export async function updateCardDraft(
  id: string,
  patch: {
    thoughtCore?: string;
    story?: string;
    tags?: string[];
    visibility?: Visibility;
    media?: CardMedia;
    accentHue?: number | null;
    anonymous?: boolean;
  }
): Promise<Card> {
  requireUid();
  const ref = doc(getClientDb(), 'cards', id);
  await setDoc(ref, { ...patch, ...clearedMedia(patch), updatedAt: serverTimestamp() }, { merge: true });
  const snap = await getDoc(ref);
  return mapCard(snap.id, snap.data() ?? {});
}

/** What publishing answers (POST /api/v1/cards/{id}/publish). */
export interface PublishedCard {
  id: string;
  /** The English URL slug; null if generating it failed (the card is live at its id). */
  slug: string | null;
  /** False when it was already live — publishing again never re-dates a card. */
  firstPublish: boolean;
}

/**
 * Publish one of your cards through the server, the same call the apps make.
 * The rules keep `publishedAt` and the slug out of the client's reach: the
 * server stamps the card once (re-stamping would re-date it in every feed),
 * names it, and for a resonance connects the two authors and rings the
 * original author's bell, re-checking visibility and blocks. Editing a
 * published card goes through the pending-edit buffer (see ./cardEdits) and
 * never comes here.
 */
export async function publishCard(id: string): Promise<PublishedCard> {
  requireUid();
  return callApi<PublishedCard>(`/api/v1/cards/${encodeURIComponent(id)}/publish`, { method: 'POST' });
}

/**
 * A removed cover arrives as `media: undefined`, which a merge write silently
 * drops (the client runs with ignoreUndefinedProperties) — the old cover
 * would survive. Say "delete it" instead. Shared with applyPendingCardEdit.
 */
export function clearedMedia(values: { media?: CardMedia }): { media?: ReturnType<typeof deleteField> } {
  return 'media' in values && values.media === undefined ? { media: deleteField() } : {};
}

export async function deleteCardDraft(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(getClientDb(), 'cards', id));
}
