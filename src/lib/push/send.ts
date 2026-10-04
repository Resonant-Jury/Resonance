import { FieldValue, type DocumentReference, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { NOTE_PREVIEW_CHARS } from '@/lib/api/v1/conversations';
import { deviceLocale, type DeviceLocale } from './devices';

/** What sends the push; `getAdminMessaging()` in production, a fake in tests. */
export interface PushSender {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

/** The Android channel the apps create for these (its id is part of the contract with them). */
export const ANDROID_CHANNEL = 'activity';
/** The channel a conversation's messages come in (the apps create it beside `activity`). */
export const MESSAGES_CHANNEL = 'messages';

const MESSAGES: Record<DeviceLocale, typeof en> = { en, 'zh-TW': zhTW };

/** `app.notifications.*`: the bell's own copy, so a push reads exactly as the row it opens. */
const TEXT_KEY: Record<string, keyof typeof en.app.notifications> = {
  resonance: 'resonance',
  note: 'note',
  message: 'message',
  card_link: 'cardLink',
  invite: 'invite',
  invite_accepted: 'inviteAccepted',
  translation_done: 'translationDone',
  resonance_summary: 'resonanceSummary',
};

/** The kinds whose push opens a conversation with their sender (pushRoute's thread). */
const OPENS_THREAD = new Set(['note', 'message', 'resonance', 'invite_accepted']);

/** sendEachForMulticast's limit on tokens per call. */
export const MULTICAST_MAX = 500;

/** Tokens FCM will never deliver to again — the app was uninstalled or the token rotated. */
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** Cut by code points, so an emoji is never split in half. */
const cutText = (text: string, n: number) => Array.from(text).slice(0, n).join('');

/**
 * A note or resonance on an anonymous card (`payload.anonymous`): it opens the
 * card, never a thread with whoever wrote it — opening that thread zeroes
 * their unread count in it, which they can watch, and its reply would answer
 * the anonymous card under its author's name.
 */
const onAnonymousCard = (type: string, payload: Payload) => (type === 'note' || type === 'resonance') && payload.anonymous === true;

/**
 * Where tapping the push leads: a site path both apps already open (the web
 * bell's hrefs). A note opens the thread with it quoted — or, on an anonymous
 * card, the card; types with no page of their own leave it empty and the app
 * shows its notifications.
 */
export function pushRoute(type: string, payload: Payload): string {
  const handle = str(payload.fromHandle);
  const thread = handle ? `/messages/${encodeURIComponent(handle)}` : '';
  if (onAnonymousCard(type, payload)) return str(payload.cardId) ? `/card/${encodeURIComponent(str(payload.cardId))}` : '';
  switch (type) {
    case 'note': {
      const [note, card] = [str(payload.noteId), str(payload.cardId)];
      return thread && note && card ? `${thread}?note=${encodeURIComponent(note)}&card=${encodeURIComponent(card)}` : thread;
    }
    case 'message':
    case 'resonance':
    case 'invite_accepted':
      return thread;
    case 'card_link':
    case 'translation_done':
      return str(payload.cardId) ? `/card/${encodeURIComponent(str(payload.cardId))}` : '';
    default:
      return '';
  }
}

/** The push's lines in one language: the bell's sentence, and a note's preview under it. */
export function pushText(locale: DeviceLocale, type: string, payload: Payload): { title: string; body?: string } | null {
  const key = TEXT_KEY[type];
  if (!key) return null;
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' });
  const title = t(key, { handle: str(payload.fromHandle), count: Number(payload.count ?? 0) });
  const preview = type === 'note' ? str(payload.preview) : '';
  return preview ? { title, body: `「${preview}」` } : { title };
}

export interface PushResult {
  sent: number;
  /** Device records removed because FCM no longer knows their token. */
  pruned: number;
}

/** One registered install, as a push sees it. */
export interface DeviceTarget {
  token: string;
  ref: DocumentReference;
  locale: DeviceLocale;
  platform: string;
  /** What the build says it can do with a push (`registerDevice`'s `capabilities`). */
  capabilities: string[];
}

/** The pushable installs among a user's `devices` documents (those with a token). */
export function deviceTargets(docs: QueryDocumentSnapshot[]): DeviceTarget[] {
  const targets: DeviceTarget[] = [];
  for (const d of docs) {
    const token = str(d.get('token'));
    if (!token) continue;
    const capabilities = d.get('capabilities');
    targets.push({
      token,
      ref: d.ref,
      locale: deviceLocale(d.get('locale')),
      platform: str(d.get('platform')),
      capabilities: Array.isArray(capabilities) ? capabilities.filter((c): c is string => typeof c === 'string') : [],
    });
  }
  return targets;
}

/** The targets split by the language their app speaks, in the order each language first appears. */
export function groupByLocale(targets: DeviceTarget[]): Map<DeviceLocale, DeviceTarget[]> {
  const byLocale = new Map<DeviceLocale, DeviceTarget[]>();
  for (const t of targets) byLocale.set(t.locale, [...(byLocale.get(t.locale) ?? []), t]);
  return byLocale;
}

/**
 * Send one message to many installs, FCM's limit of tokens a call at a time.
 * `dead` are the installs whose token FCM will never deliver to again; pass
 * them to `forgetDevices` once everything has been sent.
 */
export async function multicastTo(
  sender: PushSender,
  targets: DeviceTarget[],
  build: (tokens: string[]) => MulticastMessage,
): Promise<{ sent: number; dead: DocumentReference[] }> {
  let sent = 0;
  const dead: DocumentReference[] = [];
  for (let start = 0; start < targets.length; start += MULTICAST_MAX) {
    const batch = targets.slice(start, start + MULTICAST_MAX);
    const res = await sender.sendEachForMulticast(build(batch.map((t) => t.token)));
    sent += res.successCount;
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && DEAD_TOKEN.has(r.error.code)) dead.push(batch[i].ref);
    });
  }
  return { sent, dead };
}

/** Delete the device records of tokens FCM has given up on. */
export async function forgetDevices(db: Firestore, dead: DocumentReference[]): Promise<void> {
  // A batch holds 500 writes, as a multicast holds 500 tokens.
  for (let start = 0; start < dead.length; start += MULTICAST_MAX) {
    const batch = db.batch();
    dead.slice(start, start + MULTICAST_MAX).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/**
 * Push `notifications/{id}` to its recipient's devices, once. The bell row is
 * the record; this only rings the phone — so it never throws into a writer
 * (callers run it after their response) and a failure just means no buzz.
 *
 * Claimed with `pushedAt` in a transaction before anything is sent, so two
 * callers (a retry racing the writer's own ring) never push twice. A block
 * standing between the two people at send time silences it, as the writers
 * already refuse the notification itself across one.
 */
export async function pushNotification(db: Firestore, id: string, sender: PushSender): Promise<PushResult | null> {
  const ref = db.doc(`notifications/${id}`);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('pushedAt') != null || snap.get('readAt') != null) return null;
    tx.update(ref, { pushedAt: FieldValue.serverTimestamp() });
    return snap.data()!;
  });
  if (!claimed) return null;

  const to = str(claimed.userId);
  const type = str(claimed.type);
  let payload: Payload = claimed.payload ?? {};
  const from = str(payload.fromUserId);
  if (!to || !TEXT_KEY[type]) return null;
  if (from) {
    const noteId = type === 'note' ? str(payload.noteId) : '';
    const [out, inn, sender, note] = await Promise.all([
      db.doc(`users/${to}/blocks/${from}`).get(),
      db.doc(`users/${from}/blocks/${to}`).get(),
      db.doc(`users/${from}`).get(),
      noteId ? db.doc(`notes/${noteId}`).get() : null,
    ]);
    if (out.exists || inn.exists) return null;
    // What a push says is read from the records, never from the row: the
    // sender's pen name as it is now, and a note's words only when the note
    // really went from them to the recipient. A row a client wrote can't put
    // other words, or another name, on someone's lock screen.
    const real = note?.exists && note.get('fromUserId') === from && note.get('toUserId') === to;
    payload = {
      ...payload,
      fromHandle: str(sender.get('handle')),
      preview: real ? cutText(str(note.get('text')), NOTE_PREVIEW_CHARS) : '',
    };
  }

  const devices = await db.collection('devices').where('userId', '==', to).get();
  if (devices.empty) return { sent: 0, pruned: 0 };

  // One multicast per language, each device reading the push in the app's own UI language.
  const route = pushRoute(type, payload);
  // The sender's uid beside the route, for a push that opens their thread: the
  // apps open a conversation by uid (a pen name can change before the tap).
  const opensThread = from && OPENS_THREAD.has(type) && !onAnonymousCard(type, payload);
  const data: Record<string, string> = { notificationId: id, type, route, ...(opensThread ? { fromUserId: from } : {}) };
  let sent = 0;
  const dead: DocumentReference[] = [];
  for (const [locale, targets] of groupByLocale(deviceTargets(devices.docs))) {
    const text = pushText(locale, type, payload);
    if (!text) continue;
    const result = await multicastTo(sender, targets, (tokens) => ({
      tokens,
      notification: text,
      data,
      android: { notification: { channelId: ANDROID_CHANNEL, tag: id } },
      apns: { payload: { aps: { sound: 'default', threadId: type } } },
    }));
    sent += result.sent;
    dead.push(...result.dead);
  }
  await forgetDevices(db, dead);
  return { sent, pruned: dead.length };
}
