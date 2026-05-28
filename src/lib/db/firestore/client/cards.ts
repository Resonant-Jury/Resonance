'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Card, CardMedia, Locale, NewCard, Visibility } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { requestRevalidate } from './revalidate';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function mapCard(id: string, data: Record<string, unknown>): Card {
  const publishedAt = data.publishedAt as Timestamp | null | undefined;
  return {
    id,
    authorId: String(data.authorId),
    thoughtCore: String(data.thoughtCore ?? ''),
    story: String(data.story ?? ''),
    tags: (data.tags as string[]) ?? [],
    media: data.media as CardMedia | undefined,
    originalLocale: (data.originalLocale as Locale) ?? 'zh-TW',
    translations: (data.translations as Card['translations']) ?? {},
    visibility: (data.visibility as Visibility) ?? 'public',
    embedding: data.embedding as number[] | undefined,
    referenceCardId: data.referenceCardId as string | undefined,
    publishedAt: publishedAt ? publishedAt.toDate() : null,
    readCount: Number(data.readCount ?? 0),
    resonanceCount: Number(data.resonanceCount ?? 0),
    inviteCount: Number(data.inviteCount ?? 0),
  };
}

export async function createCardDraft(input: {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  originalLocale: Locale;
  media?: CardMedia;
  referenceCardId?: string;
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
  const card = mapCard(snap.id, snap.data() ?? {});
  await requestRevalidate([`/card/${id}`, '/home', '/me']);
  return card;
}

export async function deleteCardDraft(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(getClientDb(), 'cards', id));
  await requestRevalidate(['/me']);
}
