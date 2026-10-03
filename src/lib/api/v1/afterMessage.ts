import { after } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { unfurlMessage } from '@/lib/links/preview';
import { pushMessage } from '@/lib/push/chat';
import type { SentMessage } from './conversations';

/**
 * After the response to a send: ring the recipient's phone and unfurl the
 * message's link. Two separate jobs, run side by side — a page that takes its
 * five seconds to answer never holds up the buzz, and neither one failing
 * stops the other (each logs and gives up). A message that was only sent
 * again (`duplicate`) has had both already.
 */
export function afterMessageSent(db: Firestore, sent: SentMessage) {
  const { push } = sent;
  if (sent.duplicate || !push) return;
  after(async () => {
    await Promise.all([
      getAdminMessaging()
        .then((messaging) => pushMessage(db, push, messaging))
        .catch((e) => console.error('[push]', push.messageId, e)),
      unfurlMessage(db, push.conversationId, push.messageId).catch((e) => console.error('[unfurl]', push.messageId, e)),
    ]);
  });
}
