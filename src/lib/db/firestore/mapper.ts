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

export function mapCard(id: string, data: Raw): Card {
  return {
    ...(data as Omit<Card, 'id' | 'publishedAt'>),
    id,
    publishedAt: toNullableDate(data.publishedAt),
  };
}

export function mapUser(id: string, data: Raw): User {
  return {
    ...(data as Omit<User, 'id' | 'joinedAt' | 'handleChangedAt'>),
    id,
    joinedAt: toDate(data.joinedAt),
    handleChangedAt: toDate(data.handleChangedAt),
  };
}

export function mapConnection(id: string, data: Raw): Connection {
  return {
    ...(data as Omit<Connection, 'id' | 'establishedAt'>),
    id,
    establishedAt: toDate(data.establishedAt),
  };
}

export function mapInvite(id: string, data: Raw): Invite {
  return {
    ...(data as Omit<Invite, 'id' | 'createdAt' | 'expiresAt'>),
    id,
    createdAt: toDate(data.createdAt),
    expiresAt: toDate(data.expiresAt),
  };
}

export function mapNotification(id: string, data: Raw): Notification {
  return {
    ...(data as Omit<Notification, 'id' | 'createdAt' | 'readAt'>),
    id,
    createdAt: toDate(data.createdAt),
    readAt: toNullableDate(data.readAt),
  };
}
