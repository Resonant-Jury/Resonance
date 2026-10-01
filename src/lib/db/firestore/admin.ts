import { getApp, getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

function privateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

function firebaseAdminConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const key = privateKey();

  if (projectId && clientEmail && key) {
    return {
      credential: cert({ projectId, clientEmail, privateKey: key }),
      projectId,
    };
  }

  return {
    credential: applicationDefault(),
    projectId,
  };
}

/**
 * `FIRESTORE_PREFER_REST=1` has the Firestore client speak HTTP/1.1 REST
 * instead of gRPC (every call the server makes is unary or a query; it holds
 * no listeners): a cold start then loads no gRPC stack and opens no HTTP/2
 * channel, possibly at some cost per call on a warm instance. Off unless set,
 * so it can be compared on a deployment (Server-Timing on every v1 answer,
 * lib/api/v1/http). Never against the emulator: the REST client insists on
 * Google credentials, which the emulator doesn't have.
 */
export function prefersRest(env: Record<string, string | undefined> = process.env): boolean {
  return env.FIRESTORE_PREFER_REST === '1' && !env.FIRESTORE_EMULATOR_HOST;
}

export function getAdminDb(): Firestore {
  // The auth module may have made the app already; Firestore's settings are this module's.
  if (!getApps().length) {
    initializeApp(firebaseAdminConfig());
  }
  // Asking again with the same settings answers the same instance.
  return prefersRest() ? initializeFirestore(getApp(), { preferRest: true }) : getFirestore();
}

/**
 * FCM through the same admin app (push: `src/lib/push`) — loaded when a push
 * is first sent, after a response, rather than by every function that
 * touches Firestore.
 */
export async function getAdminMessaging(): Promise<Messaging> {
  getAdminDb();
  const { getMessaging } = await import('firebase-admin/messaging');
  return getMessaging();
}
