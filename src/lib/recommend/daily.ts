import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { RecommendationItem } from '@/lib/db/types';
import { recommendFeed } from './funnel';

/** UTC day key — the feed regenerates at most once per day per user. */
export function recommendationDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The reader's recommended feed for today: the cached result when it was
 * built today, otherwise the (LLM-bearing) funnel runs once and its result is
 * cached. Shared by the web route and /api/v1/feed/recommended.
 */
export async function dailyRecommendations(
  db: Firestore,
  uid: string,
  build: (uid: string) => Promise<RecommendationItem[]> = recommendFeed,
  now = new Date(),
): Promise<{ items: RecommendationItem[]; cached: boolean }> {
  const ref = db.collection('recommendations').doc(uid);
  const snap = await ref.get();
  const day = recommendationDay(now);
  if (snap.exists && snap.data()?.date === day) {
    return { items: (snap.data()?.items ?? []) as RecommendationItem[], cached: true };
  }
  const items = await build(uid);
  await ref.set({ date: day, items, generatedAt: FieldValue.serverTimestamp() });
  return { items, cached: false };
}
