import { Timestamp } from 'firebase-admin/firestore';
import type { Card, Connection, Invite, Notification, User } from '../types';

type Raw = Record<string, unknown>;

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

export function toNullableDate(value: unknown): Date | null {
  if (value == null) return null;
  return toDate(value);
}

export function fromDate(value: Date | null | undefined): Timestamp | null {
  if (!value) return null;
  return Timestamp.fromDate(value);
}

/**
 * Recursively normalizes a Firestore document so it can safely cross the
 * RSC → Client Component boundary:
 *   - Firestore `Timestamp` instances become `Date`
 *   - Objects with a null prototype (which the Admin SDK occasionally returns
 *     for nested maps) become plain `{}` objects
 *   - Arrays and nested maps are walked recursively
 */
export function sanitize<T = unknown>(value: unknown): T {
  if (value == null) return value as T;
  if (value instanceof Timestamp) return value.toDate() as T;
  if (value instanceof Date) return value as T;
  if (Array.isArray(value)) return value.map((v) => sanitize(v)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitize(v);
    }
    return out as T;
  }
  return value as T;
}

function sanitizeDoc(data: Raw): Raw {
  return sanitize<Raw>(data);
}

export function mapCard(id: string, data: Raw): Card {
  const clean = sanitizeDoc(data);
  return {
    ...(clean as Omit<Card, 'id' | 'publishedAt'>),
    id,
    publishedAt: toNullableDate(clean.publishedAt),
  };
}

export function mapUser(id: string, data: Raw): User {
  const clean = sanitizeDoc(data);
  return {
    ...(clean as Omit<User, 'id' | 'joinedAt' | 'handleChangedAt'>),
    id,
    joinedAt: toDate(clean.joinedAt),
    handleChangedAt: toDate(clean.handleChangedAt),
  };
}

export function mapConnection(id: string, data: Raw): Connection {
  const clean = sanitizeDoc(data);
  return {
    ...(clean as Omit<Connection, 'id' | 'establishedAt'>),
    id,
    establishedAt: toDate(clean.establishedAt),
  };
}

export function mapInvite(id: string, data: Raw): Invite {
  const clean = sanitizeDoc(data);
  return {
    ...(clean as Omit<Invite, 'id' | 'createdAt' | 'expiresAt'>),
    id,
    createdAt: toDate(clean.createdAt),
    expiresAt: toDate(clean.expiresAt),
  };
}

export function mapNotification(id: string, data: Raw): Notification {
  const clean = sanitizeDoc(data);
  return {
    ...(clean as Omit<Notification, 'id' | 'createdAt' | 'readAt'>),
    id,
    createdAt: toDate(clean.createdAt),
    readAt: toNullableDate(clean.readAt),
  };
}
