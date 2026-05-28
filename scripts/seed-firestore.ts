/**
 * Seed Firestore with mock CARDS / USERS / CONNECTIONS / RESONANCES.
 *
 * Run with:
 *   npx tsx scripts/seed-firestore.ts
 *
 * Requires either:
 *   - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY env vars, or
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON, or
 *   - `gcloud auth application-default login`
 */

import 'dotenv/config';
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { CARDS, USERS, CONNECTIONS, RESONANCES, NOTIFICATIONS, INVITES } from '../src/lib/mock/data';

function initAdmin() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  } else {
    initializeApp({ credential: applicationDefault(), projectId });
  }
}

function dateToTs(d: Date | null | undefined) {
  return d ? Timestamp.fromDate(d) : null;
}

async function seed() {
  initAdmin();
  const db = getFirestore();
  const batch = db.batch();

  for (const user of USERS) {
    const ref = db.collection('users').doc(user.id);
    batch.set(ref, {
      handle: user.handle,
      handleLower: user.handle.toLowerCase(),
      bio: user.bio ?? '',
      region: user.region,
      primaryLocale: user.primaryLocale,
      autoTranslateTo: user.autoTranslateTo,
      verified: user.verified,
      phoneHash: user.phoneHash,
      avatarSeed: user.avatarSeed,
      initials: user.initials,
      accentColor: user.accentColor,
      joinedAt: dateToTs(user.joinedAt),
      handleChangedAt: dateToTs(user.handleChangedAt),
    });
  }

  for (const card of CARDS) {
    const ref = db.collection('cards').doc(card.id);
    batch.set(ref, {
      authorId: card.authorId,
      thoughtCore: card.thoughtCore,
      story: card.story,
      tags: card.tags,
      media: card.media ?? null,
      originalLocale: card.originalLocale,
      translations: card.translations ?? {},
      visibility: card.visibility,
      referenceCardId: card.referenceCardId ?? null,
      publishedAt: dateToTs(card.publishedAt),
      readCount: card.readCount,
      resonanceCount: card.resonanceCount,
      inviteCount: card.inviteCount,
      accentHue: card.accentHue ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const conn of CONNECTIONS) {
    batch.set(db.collection('connections').doc(conn.id), {
      userIds: conn.userIds,
      establishedAt: dateToTs(conn.establishedAt),
    });
  }

  for (const r of RESONANCES) {
    batch.set(db.collection('resonances').doc(r.id), {
      cardId: r.cardId,
      userId: r.userId,
      note: r.note ?? null,
      createdAt: dateToTs(r.createdAt),
    });
  }

  for (const n of NOTIFICATIONS) {
    batch.set(db.collection('notifications').doc(n.id), {
      userId: n.userId,
      type: n.type,
      payload: n.payload,
      readAt: dateToTs(n.readAt),
      createdAt: dateToTs(n.createdAt),
    });
  }

  for (const inv of INVITES) {
    batch.set(db.collection('invites').doc(inv.id), {
      fromUserId: inv.fromUserId,
      toUserId: inv.toUserId,
      message: inv.message,
      referenceCardId: inv.referenceCardId ?? null,
      status: inv.status,
      expiresAt: dateToTs(inv.expiresAt),
      createdAt: dateToTs(inv.createdAt),
    });
  }

  await batch.commit();
  console.log(
    `Seeded ${USERS.length} users, ${CARDS.length} cards, ${CONNECTIONS.length} connections, ${RESONANCES.length} resonances, ${NOTIFICATIONS.length} notifications, ${INVITES.length} invites`
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
