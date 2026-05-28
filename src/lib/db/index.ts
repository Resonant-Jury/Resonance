import type {
  ICardRepository,
  IConnectionRepository,
  IInviteRepository,
  INotificationRepository,
  IResonanceRepository,
  IUserRepository,
} from './interfaces';
import { MockCardRepository } from './mock/card';
import { MockUserRepository } from './mock/user';
import { MockConnectionRepository } from './mock/connection';
import { MockInviteRepository } from './mock/invite';
import { MockResonanceRepository } from './mock/resonance';
import { MockNotificationRepository } from './mock/notification';
import { FirestoreCardRepository } from './firestore/card';
import { FirestoreUserRepository } from './firestore/user';
import { FirestoreConnectionRepository } from './firestore/connection';
import { FirestoreInviteRepository } from './firestore/invite';
import { FirestoreResonanceRepository } from './firestore/resonance';
import { FirestoreNotificationRepository } from './firestore/notification';

const USE_MOCK =
  process.env.DATA_PROVIDER === 'mock' ||
  (process.env.DATA_PROVIDER === undefined &&
    (process.env.NEXT_PUBLIC_USE_MOCK === undefined ||
      process.env.NEXT_PUBLIC_USE_MOCK !== 'false'));

export interface Repos {
  card: ICardRepository;
  user: IUserRepository;
  connection: IConnectionRepository;
  invite: IInviteRepository;
  resonance: IResonanceRepository;
  notification: INotificationRepository;
}

function buildRepos(): Repos {
  if (USE_MOCK) {
    return {
      card: new MockCardRepository(),
      user: new MockUserRepository(),
      connection: new MockConnectionRepository(),
      invite: new MockInviteRepository(),
      resonance: new MockResonanceRepository(),
      notification: new MockNotificationRepository(),
    };
  }
  return {
    card: new FirestoreCardRepository(),
    user: new FirestoreUserRepository(),
    connection: new FirestoreConnectionRepository(),
    invite: new FirestoreInviteRepository(),
    resonance: new FirestoreResonanceRepository(),
    notification: new FirestoreNotificationRepository(),
  };
}

export const repos: Repos = buildRepos();

export { CURRENT_USER_ID } from '@/lib/mock/data';
export type * from './types';
export type * from './interfaces';
export * from './errors';
