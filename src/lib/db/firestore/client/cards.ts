'use client';

import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from './sdk';
import type { FeedCardBody, ResonateResponseBody } from '@/lib/api/v1/schemas';
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
 * would survive. Say "delete it" instead.
 */
function clearedMedia(values: { media?: CardMedia }): { media?: ReturnType<typeof deleteField> } {
  return 'media' in values && values.media === undefined ? { media: deleteField() } : {};
}

/**
 * Change one of your cards' visibility and/or byline through the server
 * (PATCH /api/v1/cards/{id}, the call the apps make): it also carries the
 * change into a pending edit, takes a card that is no longer public out of
 * the recommender's pool, and drops the cached pages that showed it as it
 * was. Answers the card as your card box shows it (your byline kept on an
 * anonymous card).
 */
export async function updateCardSettings(
  id: string,
  patch: { visibility?: Visibility; anonymous?: boolean },
): Promise<FeedCardBody> {
  requireUid();
  return callApi<FeedCardBody>(`/api/v1/cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

/**
 * Delete one of your cards, draft or published, through the server (DELETE
 * /api/v1/cards/{id}): with its pending edit and its recommendation vectors,
 * and the cached pages that showed it dropped.
 */
export async function deleteCard(id: string): Promise<void> {
  requireUid();
  await callApi<null>(`/api/v1/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * What resonating with a card answers (POST /api/v1/cards/{id}/resonances):
 * your card as your card box shows it, now answering that card, and whether
 * anything changed (false: it already answered it, no one was rung).
 */
export type ResonateResult = ResonateResponseBody;

/**
 * Make one of your published public cards a resonance of `targetId` through
 * the server (the call the apps make): the rules never let the browser point
 * a card written already at another. The server connects the two authors and
 * rings the original's author as publishing a resonance does, and refuses
 * with 409 (`ApiError.code === 'conflict'`) a card already answering another
 * one, or a second card of yours for the same original.
 */
export async function resonateWith(targetId: string, cardId: string): Promise<ResonateResult> {
  requireUid();
  return callApi<ResonateResult>(`/api/v1/cards/${encodeURIComponent(targetId)}/resonances`, { method: 'POST', body: { cardId } });
}

/**
 * Your card stops answering `targetId` and stays as a card of its own
 * (DELETE /api/v1/cards/{id}/resonances/{cardId}); asking again is harmless.
 */
export async function unresonate(targetId: string, cardId: string): Promise<void> {
  requireUid();
  await callApi<null>(`/api/v1/cards/${encodeURIComponent(targetId)}/resonances/${encodeURIComponent(cardId)}`, { method: 'DELETE' });
}
