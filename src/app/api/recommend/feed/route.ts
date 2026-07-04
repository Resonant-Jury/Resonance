import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { recommendFeed } from '@/lib/recommend/funnel';
import type { RecommendationItem } from '@/lib/db/types';

export const runtime = 'nodejs';
// The funnel runs the rerank + select LLM calls; only on a cache miss.
export const maxDuration = 120;

/** UTC day key — the feed regenerates at most once per day per user. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The reader's recommended feed. Returns a cached daily result when fresh, and
 * only runs the (LLM-bearing) funnel on a cache miss — keeping per-read cost
 * near zero. Returns only card ids + reasons; the client resolves the cards
 * through the visibility-enforced read path.
 */
export async function GET() {
  const user = await requireUser();
  const ref = getAdminDb().collection('recommendations').doc(user.id);

  const snap = await ref.get();
  const day = today();
  if (snap.exists && snap.data()?.date === day) {
    return NextResponse.json({ items: (snap.data()?.items ?? []) as RecommendationItem[], cached: true });
  }

  const items = await recommendFeed(user.id);
  await ref.set({ date: day, items, generatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ items, cached: false });
}
