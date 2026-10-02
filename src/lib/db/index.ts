import type {
  ICardRepository,
  IConnectionRepository,
  INotificationRepository,
  IUserRepository,
} from './interfaces';
import { FirestoreCardRepository } from './firestore/card';
import { FirestoreUserRepository } from './firestore/user';
import { FirestoreConnectionRepository } from './firestore/connection';
import { FirestoreNotificationRepository } from './firestore/notification';

export interface Repos {
  card: ICardRepository;
  user: IUserRepository;
  connection: IConnectionRepository;
  notification: INotificationRepository;
}

export const repos: Repos = {
  card: new FirestoreCardRepository(),
  user: new FirestoreUserRepository(),
  connection: new FirestoreConnectionRepository(),
  notification: new FirestoreNotificationRepository(),
};

export type * from './types';
export type * from './interfaces';
export * from './errors';
