'use client';

import { Timestamp } from 'firebase/firestore';
import type { Card, CardMedia, Locale, User } from '@/lib/db/types';

type Raw = Record<string, unknown>;

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

function toNullableDate(value: unknown): Date | null {
  if (value == null) return null;
  return toDate(value);
}

/** Map a client-SDK Firestore card document into the shared Card shape. */
export function mapCard(id: string, data: Raw): Card {
  return {
    id,
    authorId: String(data.authorId),
    slug: data.slug as string | undefined,
    thoughtCore: String(data.thoughtCore ?? ''),
    story: String(data.story ?? ''),
    tags: (data.tags as string[]) ?? [],
    media: data.media as CardMedia | undefined,
    originalLocale: (data.originalLocale as Locale) ?? 'zh-TW',
    translations: (data.translations as Card['translations']) ?? {},
    visibility: (data.visibility as Card['visibility']) ?? 'public',
    embedding: data.embedding as number[] | undefined,
    referenceCardId: data.referenceCardId as string | undefined,
    publishedAt: toNullableDate(data.publishedAt),
    readCount: Number(data.readCount ?? 0),
    resonanceCount: Number(data.resonanceCount ?? 0),
    inviteCount: Number(data.inviteCount ?? 0),
  };
}

/** Map a client-SDK Firestore user document into the shared User shape. */
export function mapUser(id: string, data: Raw): User {
  return {
    id,
    handle: String(data.handle ?? ''),
    bio: data.bio as string | undefined,
    region: String(data.region ?? ''),
    primaryLocale: (data.primaryLocale as Locale) ?? 'zh-TW',
    autoTranslateTo: (data.autoTranslateTo as Locale[]) ?? [],
    verified: Boolean(data.verified),
    phoneHash: String(data.phoneHash ?? ''),
    avatarSeed: String(data.avatarSeed ?? '0'),
    avatarUrl: data.avatarUrl as string | undefined,
    initials: String(data.initials ?? ''),
    accentColor: String(data.accentColor ?? 'oklch(88% 0.08 55)'),
    joinedAt: toDate(data.joinedAt),
    handleChangedAt: toDate(data.handleChangedAt),
  };
}
