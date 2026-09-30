'use client';

import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import type { CardLink } from '@/lib/db/types';
import { getClientDb } from './init';

// Card links ({sourceCardId}_{targetCardId}) are read-only here: nothing
// creates them from the browser any more (the rules refuse it), and the
// existing ones still show on the card and profile pages — the newest few,
// as the API lists them (LINK_LIMIT in lib/api/v1/reads.ts).
const LINK_LIMIT = 30;

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

/** Links pointing at a single card (for the author's card-detail view). */
export async function listLinksToCard(cardId: string): Promise<CardLink[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cardLinks'),
      where('targetCardId', '==', cardId),
      orderBy('createdAt', 'desc'),
      limit(LINK_LIMIT),
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
      limit(LINK_LIMIT),
    ),
  );
  return snap.docs.map((d) => mapCardLink(d.id, d.data()));
}
