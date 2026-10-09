import { FieldValue, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { getAdminMessaging } from '@/lib/db/firestore/admin';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { recommendationDay } from '@/lib/recommend/stored';
import type { DeviceLocale } from './devices';
import { PICKS_CHANNEL, PICK_TITLE_CHARS, cardRoute } from './picks';
import { runPool } from './pool';
import { deviceTargets, forgetDevices, groupByLocale, multicastTo, type PushSender } from './send';
import { NOTIFICATION_SETTINGS, readNotificationSettings } from './settings';

/**
 * "A new card from someone you're connected with": after a card's FIRST
 * publish (the publish route's after-response work), each of the author's
 * connections who turned `connectionCards` on hears of it — push only, never
 * a bell row.
 *
 * Only a card that is published, public and under its author's name, by an
 * author with a pen name: an anonymous one would be named by the push, and a
 * connections-only or private one isn't news to share. A resonance counts
 * (it is a public card under a pen name too) — except to the author of the
 * card it answers, whose own bell already rings for it.
 *
 * Each recipient is skipped when they muted the connection, when a block
 * stands between the two either way, or when the card stopped being public,
 * named and published by the time it would go (it is read again then). At
 * most three a day reach one person from this, claimed in
 * `connectionCardPushes/{uid}` in a transaction before sending (`{ day,
 * cards }`: today's UTC day and the cards pushed on it), which also makes it
 * once only per card. Connections are few; past CONNECTION_FANOUT_MAX the
 * rest are left out and the cut is logged.
 */

export const CONNECTION_CARD_PUSHES = 'connectionCardPushes';
/** Pushes of this kind one person gets in a (UTC) day. */
export const CONNECTION_CARDS_PER_DAY = 3;
/** The most connections one publish rings. */
export const CONNECTION_FANOUT_MAX = 500;
/** `getAll` batch of settings documents. */
const SETTINGS_BATCH = 100;
const CONCURRENCY = 8;

const MESSAGES: Record<DeviceLocale, typeof en> = { en, 'zh-TW': zhTW };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const cut = (text: string, n: number) => Array.from(text).slice(0, n).join('');

/** Whether `muted` (connections/{pair}.muted: `{ by }[]`) holds `uid`. */
function mutedBy(muted: unknown, uid: string): boolean {
  return Array.isArray(muted) && muted.some((m) => m && typeof m === 'object' && (m as { by?: unknown }).by === uid);
}

/** A card that may be announced: published, public, named, with a title. */
function announceable(data: DocumentData | undefined): boolean {
  return !!data && data.publishedAt != null && data.visibility === 'public' && data.anonymous !== true && !!str(data.thoughtCore).trim();
}

/** The push's words in one language: who wrote a new card, then its title. */
export function connectionCardText(locale: DeviceLocale, handle: string, cardTitle: string): { title: string; body: string } {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' });
  return { title: t('newCard', { handle }), body: cut(cardTitle.trim(), PICK_TITLE_CHARS) };
}

/** Claim this card's push to `uid` for today: false once it went, or three already did today. */
async function claim(ref: DocumentReference, cardId: string, day: string): Promise<boolean> {
  return ref.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cards = snap.get('day') === day && Array.isArray(snap.get('cards')) ? (snap.get('cards') as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    if (cards.includes(cardId) || cards.length >= CONNECTION_CARDS_PER_DAY) return false;
    tx.set(ref, { day, cards: [...cards, cardId], updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

export type ConnectionCardOutcome = 'sent' | 'muted' | 'blocked' | 'no-device' | 'capped' | 'gone';

export interface ConnectionCardRun {
  /** Why nothing went to anyone (the card, or its author, isn't one to announce). */
  skipped?: 'not-announceable' | 'no-pen-name';
  /** Connections whose settings say yes. */
  recipients: number;
  outcomes: Partial<Record<ConnectionCardOutcome | 'failed', number>>;
  /** Devices FCM took it for. */
  sent: number;
}

/**
 * Announce a just-published card to the author's connections who asked for
 * it (see the top of this file). Never throws for one recipient's failure;
 * run after the publish's response.
 */
export async function pushConnectionCard(
  db: Firestore,
  cardId: string,
  sender: PushSender,
  opts: { now?: number; concurrency?: number; fanoutMax?: number } = {},
): Promise<ConnectionCardRun> {
  const run: ConnectionCardRun = { recipients: 0, outcomes: {}, sent: 0 };
  if (!cardId || cardId.includes('/') || isReservedId(cardId)) return { ...run, skipped: 'not-announceable' };
  const cardRef = db.doc(`cards/${cardId}`);
  const card = await cardRef.get();
  if (!announceable(card.data())) return { ...run, skipped: 'not-announceable' };
  const author = str(card.get('authorId'));
  const reference = str(card.get('referenceCardId'));
  const [profile, connections, original] = await Promise.all([
    db.doc(`users/${author}`).get(),
    db.collection('connections').where('userIds', 'array-contains', author).get(),
    reference && !reference.includes('/') && !isReservedId(reference) ? db.doc(`cards/${reference}`).get() : null,
  ]);
  const handle = str(profile.get('handle')).trim();
  if (!handle) return { ...run, skipped: 'no-pen-name' };

  // The original's author hears of a resonance from its own bell already.
  const answered = str(original?.get('authorId'));
  const others = connections.docs
    .map((c) => {
      const pair: unknown = c.get('userIds');
      return { uid: Array.isArray(pair) ? pair.find((u) => u !== author) : undefined, muted: c.get('muted') };
    })
    .filter((c): c is { uid: string; muted: unknown } => typeof c.uid === 'string' && !!c.uid && !c.uid.includes('/') && c.uid !== answered);
  const max = opts.fanoutMax ?? CONNECTION_FANOUT_MAX;
  if (others.length > max) console.warn(`[push] new card ${cardId}: ${others.length} connections, announcing to the first ${max}`);
  const candidates = others.slice(0, max);

  // Who asked for it: their settings, a batch at a time.
  const wanted: { uid: string; muted: unknown }[] = [];
  for (let i = 0; i < candidates.length; i += SETTINGS_BATCH) {
    const batch = candidates.slice(i, i + SETTINGS_BATCH);
    const snaps = await db.getAll(...batch.map((c) => db.doc(`${NOTIFICATION_SETTINGS}/${c.uid}`)));
    snaps.forEach((s, j) => {
      if (readNotificationSettings(s.data()).connectionCards) wanted.push(batch[j]);
    });
  }
  run.recipients = wanted.length;
  if (!wanted.length) return run;

  const day = recommendationDay(new Date(opts.now ?? Date.now()));
  const tally = (o: ConnectionCardOutcome | 'failed') => (run.outcomes[o] = (run.outcomes[o] ?? 0) + 1);
  const title = str(card.get('thoughtCore'));

  await runPool(
    wanted,
    opts.concurrency ?? CONCURRENCY,
    async ({ uid, muted }) => {
      try {
        tally(await announceTo(uid, muted));
      } catch (e) {
        tally('failed');
        throw e;
      }
    },
    { tag: `[push] new card ${cardId}` },
  );
  return run;

  async function announceTo(uid: string, muted: unknown): Promise<ConnectionCardOutcome> {
    if (mutedBy(muted, uid)) return 'muted';
    const [out, inn, devices] = await Promise.all([
      db.doc(`users/${uid}/blocks/${author}`).get(),
      db.doc(`users/${author}/blocks/${uid}`).get(),
      db.collection('devices').where('userId', '==', uid).get(),
    ]);
    if (out.exists || inn.exists) return 'blocked';
    const targets = deviceTargets(devices.docs);
    if (!targets.length) return 'no-device';
    // Read again at send time: made private, anonymous or deleted since the publish, it goes to no one.
    const now = await cardRef.get();
    if (!announceable(now.data()) || now.get('authorId') !== author) return 'gone';
    if (!(await claim(db.doc(`${CONNECTION_CARD_PUSHES}/${uid}`), cardId, day))) return 'capped';

    const data = { type: 'new_card', cardId, route: cardRoute({ id: cardId, slug: now.get('slug') }) };
    const dead: DocumentReference[] = [];
    for (const [locale, group] of groupByLocale(targets)) {
      const text = connectionCardText(locale, handle, str(now.get('thoughtCore')) || title);
      const result = await multicastTo(sender, group, (tokens) => ({
        tokens,
        notification: text,
        data,
        android: { notification: { channelId: PICKS_CHANNEL, tag: `card-${cardId}` } },
        apns: { payload: { aps: { sound: 'default', threadId: PICKS_CHANNEL } } },
      }));
      run.sent += result.sent;
      dead.push(...result.dead);
    }
    await forgetDevices(db, dead);
    return 'sent';
  }
}

/** FCM through the Admin SDK, loaded on the first send (a publish no one asked to hear of never loads it). */
const adminSender: PushSender = {
  sendEachForMulticast: async (message) => (await getAdminMessaging()).sendEachForMulticast(message),
};

/**
 * The publish route's after-response work for a FIRST publish: once the
 * card's slug has settled (`slug`, the publish's own promise of it — so the
 * push opens the card's real address), announce it (pushConnectionCard).
 * Never throws; logs what it did when it reached anyone.
 */
export async function announceNewCard(db: Firestore, cardId: string, slug: unknown, sender: PushSender = adminSender): Promise<void> {
  try {
    await Promise.resolve(slug).catch(() => null);
    const run = await pushConnectionCard(db, cardId, sender);
    if (run.recipients) console.log(`[push] new card ${cardId}`, JSON.stringify(run));
  } catch (e) {
    console.error('[push] new card', cardId, e);
  }
}
