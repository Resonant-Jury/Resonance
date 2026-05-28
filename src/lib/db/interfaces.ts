import type {
  Card,
  Connection,
  Invite,
  NewCard,
  NewInvite,
  Notification,
  Resonance,
  User,
} from './types';

export type CardBoxTab = 'published' | 'private' | 'draft' | 'resonated';

export interface ICardRepository {
  findById(id: string, viewerId: string | null): Promise<Card | null>;
  findDailyFeed(userId: string, date: Date): Promise<Card[]>;
  findLatestPublishedFeed(limit: number, cursor?: Date): Promise<Card[]>;
  findRelated(cardId: string, limit: number): Promise<Card[]>;
  findByAuthor(authorId: string, tab: CardBoxTab): Promise<Card[]>;
  create(data: NewCard): Promise<Card>;
  update(id: string, patch: Partial<Card>): Promise<Card>;
  publish(id: string): Promise<Card>;
  deleteDraft(id: string, authorId: string): Promise<void>;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByHandle(handle: string): Promise<User | null>;
  getCurrent(): Promise<User | null>;
  updateCurrent(patch: Partial<User>): Promise<User>;
  isHandleAvailable(handle: string): Promise<boolean>;
}

export interface IConnectionRepository {
  isConnected(a: string, b: string): Promise<boolean>;
  list(userId: string): Promise<Connection[]>;
  listMutuals(userId: string): Promise<User[]>;
  sever(a: string, b: string): Promise<void>;
}

export interface IInviteRepository {
  send(input: NewInvite): Promise<Invite>;
  accept(id: string, userId: string): Promise<Connection>;
  expire(id: string): Promise<void>;
  withdraw(id: string, userId: string): Promise<void>;
  listPending(userId: string): Promise<Invite[]>;
  remainingDailyQuota(userId: string): Promise<number>;
}

export interface IResonanceRepository {
  mark(cardId: string, userId: string, note?: string): Promise<void>;
  unmark(cardId: string, userId: string): Promise<void>;
  hasResonated(cardId: string, userId: string): Promise<boolean>;
  listResonated(userId: string): Promise<Card[]>;
}

export interface INotificationRepository {
  list(userId: string, limit?: number): Promise<Notification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(id: string): Promise<void>;
}
