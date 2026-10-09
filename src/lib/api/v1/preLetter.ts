import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { ANONYMOUS_VISIBILITY_MESSAGE } from '@/lib/db/firestore/cardContent';
import { deviceLocale, type DeviceLocale } from '@/lib/push/devices';
import { clientBuild, isPreLetterBuild, preferredLanguage } from './clientBuild';
import { NoteLimitReached, openRequest } from './conversations';
import { ApiFailure } from './http';

/**
 * What the app builds made before letters (iOS ≤ 6, Android ≤ 7: see
 * ./clientBuild) still need from the server, and only they get. Those builds
 * are in the stores until the next version; remove this module (and its
 * callers: getProfile in ./reads, POST /api/v1/notes and …/publish) once they
 * are retired.
 *
 * The contract is the same for everyone — these change an answer's value or
 * status (to one the contract already lists), never its shape. A User-Agent
 * is anyone's to send, so none gives anything away: what each says, the
 * viewer could already see or do.
 */

/**
 * GET /users/{handle}: whether to tell a build before letters that it is
 * connected to someone it isn't. Those builds open a thread, and its
 * composer, only for someone their profile says they're connected with — so
 * a letter left them (a note from someone they aren't connected with: see
 * sendNote) could be neither read whole nor answered. It reads as connected
 * while that letter waits for the viewer's answer: `request.from` of the
 * two's conversation is the profile's person, exactly what sendMessage takes
 * as an answer — and the reply the thread then sends connects them.
 *
 * Never to the letter's writer (`request.from` is then the viewer), never
 * across a block either way (the viewer's own is the caller's to ask, its
 * profile read holds it; theirs is read here, only when a letter waits), and
 * never for a note on an anonymous card, which opens no letter. All it tells
 * the viewer is what their own Messages show: a letter from this person,
 * waiting for them.
 */
export async function letterReadsAsConnection(db: Firestore, viewerId: string, writerId: string, conversation: DocumentSnapshot): Promise<boolean> {
  if (viewerId === writerId || openRequest(conversation)?.from !== writerId) return false;
  const theirBlock = await db.doc(`users/${writerId}/blocks/${viewerId}`).get();
  return !theirBlock.exists;
}

/** The web's and the newer apps' own words for the two refusals below, in each language. */
const WORDS: Record<DeviceLocale, { waitForReply: string; anonymousAudience: string }> = {
  en: { waitForReply: en.card.note.waitForReply, anonymousAudience: en.write.publishPanel.anonymousVisibility },
  'zh-TW': { waitForReply: zhTW.card.note.waitForReply, anonymousAudience: zhTW.write.publishPanel.anonymousVisibility },
};

/**
 * A refusal as a build before letters is to get it — `e` itself for every
 * other request, and for every other refusal. Those builds show the server's
 * message as it is (the newer clients put their own words to these codes),
 * so two come in the words the web and the newer apps show, in the app's own
 * language (appLocale):
 *
 * - POST /notes past the unanswered notes a writer may leave: a 409 they
 *   don't know (they show "Couldn't send"), so a 403 (`forbidden`), whose
 *   message they show — "wait for their reply".
 * - Publishing a card anonymous and for connections only (a web draft's
 *   audience, kept by those builds, with their anonymous switch: see
 *   firestore.rules): the 400 as it is, saying an anonymous card is public or
 *   only for its author — which those builds can pick.
 *
 * Nothing was written either way.
 */
export async function refusalForPreLetterBuild(db: Firestore, uid: string, req: Request, e: unknown): Promise<unknown> {
  if (!isPreLetterBuild(req)) return e;
  if (e instanceof NoteLimitReached) return new ApiFailure('forbidden', WORDS[await appLocale(db, uid, req)].waitForReply);
  if (e instanceof ApiFailure && e.code === 'invalid_request' && e.message === ANONYMOUS_VISIBILITY_MESSAGE) {
    return new ApiFailure('invalid_request', WORDS[await appLocale(db, uid, req)].anonymousAudience);
  }
  return e;
}

const at = (d: DocumentSnapshot) => {
  const v = d.get('updatedAt') as { toMillis?: () => number } | undefined;
  return typeof v?.toMillis === 'function' ? v.toMillis() : 0;
};

/**
 * The language a request's app speaks (the server's messages are otherwise
 * English): the one it last registered for pushes on this platform (the
 * app's own setting), else the language the request asks for (iOS sends the
 * system's; OkHttp none), else the profile's primaryLocale. Read only on a
 * refusal — and never in its way: a read that fails falls back to the
 * language asked for (else English), so the refusal still goes out.
 */
async function appLocale(db: Firestore, uid: string, req: Request): Promise<DeviceLocale> {
  const asked = preferredLanguage(req.headers.get('accept-language'));
  try {
    const platform = clientBuild(req.headers.get('user-agent'))?.platform;
    const devices = await db.collection('devices').where('userId', '==', uid).select('platform', 'locale', 'updatedAt').get();
    const registered = devices.docs.filter((d) => d.get('platform') === platform && typeof d.get('locale') === 'string').sort((a, b) => at(b) - at(a))[0];
    if (registered) return deviceLocale(registered.get('locale'));
    if (asked) return deviceLocale(asked);
    return deviceLocale((await db.doc(`users/${uid}`).get()).get('primaryLocale'));
  } catch {
    return deviceLocale(asked);
  }
}
