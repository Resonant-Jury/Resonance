import type {
  ICardRepository,
  IConnectionRepository,
  IInviteRepository,
  INotificationRepository,
  IResonanceRepository,
  IUserRepository,
} from './interfaces';
import { FirestoreCardRepository } from './firestore/card';
import { FirestoreUserRepository } from './firestore/user';
import { FirestoreConnectionRepository } from './firestore/connection';
import { FirestoreInviteRepository } from './firestore/invite';
import { FirestoreResonanceRepository } from './firestore/resonance';
import { FirestoreNotificationRepository } from './firestore/notification';

export interface Repos {
  card: ICardRepository;
  user: IUserRepository;
  connection: IConnectionRepository;
  invite: IInviteRepository;
  resonance: IResonanceRepository;
  notification: INotificationRepository;
}

export const repos: Repos = {
  card: new FirestoreCardRepository(),
  user: new FirestoreUserRepository(),
  connection: new FirestoreConnectionRepository(),
  invite: new FirestoreInviteRepository(),
  resonance: new FirestoreResonanceRepository(),
  notification: new FirestoreNotificationRepository(),
};

export type * from './types';
export type * from './interfaces';
export * from './errors';
