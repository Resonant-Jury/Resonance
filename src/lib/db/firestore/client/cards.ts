'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { Card, CardMedia, Locale, NewCard, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { mapCard } from './map';

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
    anonymous?: boolean;
  }
): Promise<Card> {
  requireUid();
  const ref = doc(getClientDb(), 'cards', id);
  await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  const snap = await getDoc(ref);
  return mapCard(snap.id, snap.data() ?? {});
}

export async function publishCard(id: string): Promise<Card> {
  requireUid();
  const ref = doc(getClientDb(), 'cards', id);
  await setDoc(
    ref,
    { publishedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true }
  );
  const snap = await getDoc(ref);
  return mapCard(snap.id, snap.data() ?? {});
}

export async function deleteCardDraft(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(getClientDb(), 'cards', id));
}
