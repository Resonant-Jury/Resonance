import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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

export function getAdminDb() {
  if (!getApps().length) {
    initializeApp(firebaseAdminConfig());
  }
  return getFirestore();
}

/** FCM through the same admin app (push: `src/lib/push`). */
export function getAdminMessaging() {
  getAdminDb();
  return getMessaging();
}
