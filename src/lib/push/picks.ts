import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { blockedByViewer, blockHides, cardVisible } from '@/lib/api/v1/present';
import { mapCard } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { Card, RecommendationItem } from '@/lib/db/types';
import { RECOMMENDATIONS, readStored, recommendationDay } from '@/lib/recommend/stored';
import type { DeviceLocale } from './devices';
import { runPool } from './pool';
import { deviceTargets, forgetDevices, groupByLocale, multicastTo, type PushSender } from './send';
import { NOTIFICATION_SETTINGS, dailyWalkStart, optedIn, readNotificationSettings } from './settings';

/**
 * "A card for tonight" (`/api/cron/push-picks`, once a day at 12:00 UTC =
 * 20:00 Taipei): for each reader who turned it on, one card from their
 * stored picks (`recommendations/{uid}`), pushed — never a bell row (older
 * clients draw an unknown bell type badly), never the author's name.
 *
 * This module reads the picks; it never builds them (that reaches the LLM:
 * the warm-up cron does it an hour earlier), so the send runs beside
 * Firestore in Hong Kong.
 *
 * A reader is left alone when they have no device, opened their picks
 * themselves today (`askedOn`), already had one today, or had three in the
 * last seven days. The card is the first pick that isn't theirs, isn't one
 * they answered with a published resonance, wasn't pushed to them in the
 * last 30 days, and is still published and public now — and, when it is
 * under its author's name, has no block standing between them either way.
 * A block never touches an anonymous card: one left out for it would say
 * who wrote it.
 *
 * Once only: the push is claimed in `pickPushes/{uid}` in a transaction
 * before anything is sent (`{ recent: [{cardId, at}] ≤ 30, sentAt: [...] the
 * last 7 days }`), so a cron run twice, or two at once, never rings twice.
 */

export const PICK_PUSHES = 'pickPushes';
/** The Android channel these come in (`native.channelNewCards`); builds without it show them on `activity`. */
export const PICKS_CHANNEL = 'picks';
/** Pick pushes a reader gets in any seven days (today and the six before). */
export const PICKS_PER_WEEK = 3;
const WEEK_DAYS = 7;
/** A card pushed to a reader isn't pushed to them again for this long. */
export const PICK_REPEAT_DAYS = 30;
/** How many pushed cards the log keeps. */
export const PICK_RECENT_MAX = 30;
/** The card's title in the push (code points). */
export const PICK_TITLE_CHARS = 60;
/** The reason line (code points; the recommender writes ≤ 30 characters). */
const PICK_REASON_CHARS = 80;
/** Readers pushed at once. */
const CONCURRENCY = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
const MESSAGES: Record<DeviceLocale, typeof en> = { en, 'zh-TW': zhTW };
const cut = (text: string, n: number) => Array.from(text).slice(0, n).join('');

export interface PickLog {
  recent: { cardId: string; at: number }[];
  /** When each pick push went (ms). */
  sentAt: number[];
}

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' && Number.isFinite(v) ? v : null);

/** `pickPushes/{uid}`, read defensively (a missing document is an empty log). */
export function readPickLog(data: DocumentData | undefined): PickLog {
  const recent = Array.isArray(data?.recent)
    ? (data.recent as unknown[]).flatMap((r) => {
        const cardId = (r as { cardId?: unknown } | null)?.cardId;
        const at = ms((r as { at?: unknown } | null)?.at);
        return typeof cardId === 'string' && at !== null ? [{ cardId, at }] : [];
      })
    : [];
  const sentAt = Array.isArray(data?.sentAt) ? (data.sentAt as unknown[]).map(ms).filter((v): v is number => v !== null) : [];
  return { recent, sentAt };
}

const dayOf = (at: number) => recommendationDay(new Date(at));

/** Whether the log lets one more pick push go at `now`: none yet today (UTC), fewer than three in the seven days ending today. */
export function pickGate(log: PickLog, now: number): 'ok' | 'sent-today' | 'week-cap' {
  const today = dayOf(now);
  if (log.sentAt.some((at) => dayOf(at) === today)) return 'sent-today';
  const weekStart = dayOf(now - (WEEK_DAYS - 1) * DAY_MS);
  return log.sentAt.filter((at) => dayOf(at) >= weekStart).length >= PICKS_PER_WEEK ? 'week-cap' : 'ok';
}

/** The cards pushed to the reader in the last 30 days. */
export function recentlyPushed(log: PickLog, now: number): Set<string> {
  return new Set(log.recent.filter((r) => now - r.at < PICK_REPEAT_DAYS * DAY_MS).map((r) => r.cardId));
}

/** The push's words in one language: a heading, then the card's title over why it was picked. Never the author's name. */
export function pickText(locale: DeviceLocale, cardTitle: string, reason: string): { title: string; body: string } {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' });
  // The recommender writes its reasons in Chinese only; other languages get a line of their own.
  const why = locale === 'zh-TW' && reason.trim() ? cut(reason.trim(), PICK_REASON_CHARS) : t('pickBody');
  return { title: t('pickTitle'), body: `${cut(cardTitle.trim(), PICK_TITLE_CHARS)}\n${why}` };
}

/** Where the push opens: the card's page, by its slug when it has one (both apps open `/card/{key}`). */
export function cardRoute(card: { id: string; slug?: unknown }): string {
  const key = typeof card.slug === 'string' && card.slug ? card.slug : card.id;
  return `/card/${encodeURIComponent(key)}`;
}

/** The fields a candidate is judged and pushed by (never its story). */
const CARD_FIELDS = ['authorId', 'visibility', 'anonymous', 'publishedAt', 'thoughtCore', 'slug'];

/** Whether the reader answered this card with a resonance they published (their own cards naming it). */
async function answered(db: Firestore, uid: string, cardId: string): Promise<boolean> {
  // Two equality filters: served by merging the single-field indexes.
  const mine = await db.collection('cards').where('referenceCardId', '==', cardId).where('authorId', '==', uid).select('publishedAt').get();
  return mine.docs.some((d) => d.get('publishedAt') != null);
}

/** The first pick that may be pushed to the reader now (see the top of this file), with its reason. */
async function chooseCard(db: Firestore, uid: string, items: RecommendationItem[], log: PickLog, now: number): Promise<{ card: Card; reason: string } | null> {
  const pushed = recentlyPushed(log, now);
  const order = [...new Map(items.map((i) => [i.cardId, i])).values()].filter((i) => !pushed.has(i.cardId) && !isReservedId(i.cardId));
  if (!order.length) return null;
  const [snaps, blocked] = await Promise.all([
    db.getAll(...order.map((i) => db.doc(`cards/${i.cardId}`)), { fieldMask: CARD_FIELDS }),
    blockedByViewer(db, uid),
  ]);
  const byId = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, mapCard(s.id, s.data()!)]));
  for (const item of order) {
    const card = byId.get(item.cardId);
    if (!card || card.authorId === uid || !String(card.thoughtCore ?? '').trim()) continue;
    // Published and public now — the recommended feed's own filter (cardVisible), for a public card.
    if (card.visibility !== 'public' || !cardVisible(card, uid, () => false)) continue;
    if (blockHides(card, blocked)) continue;
    // Their block of the reader as well — for a named card only (blockHides says why never an anonymous one).
    if (card.anonymous !== true && (await db.doc(`users/${card.authorId}/blocks/${uid}`).get()).exists) continue;
    if (await answered(db, uid, card.id)) continue;
    return { card, reason: typeof item.reason === 'string' ? item.reason : '' };
  }
  return null;
}

/** Claim tonight's push of `cardId` for the reader, once: false when the log no longer allows it. */
async function claimPick(ref: DocumentReference, cardId: string, now: number): Promise<boolean> {
  return ref.firestore.runTransaction(async (tx) => {
    const log = readPickLog((await tx.get(ref)).data());
    if (pickGate(log, now) !== 'ok' || recentlyPushed(log, now).has(cardId)) return false;
    const recent = [...log.recent.filter((r) => now - r.at < PICK_REPEAT_DAYS * DAY_MS), { cardId, at: now }].slice(-PICK_RECENT_MAX);
    const sentAt = [...log.sentAt.filter((at) => now - at < WEEK_DAYS * DAY_MS), now];
    tx.set(ref, {
      recent: recent.map((r) => ({ cardId: r.cardId, at: Timestamp.fromMillis(r.at) })),
      sentAt: sentAt.map((at) => Timestamp.fromMillis(at)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export type PickOutcome = 'sent' | 'opted-out' | 'no-device' | 'opened-today' | 'sent-today' | 'week-cap' | 'no-card' | 'claimed';

export interface PickResult {
  outcome: PickOutcome;
  cardId?: string;
  /** Devices FCM took it for. */
  sent?: number;
}

/** Tonight's card for one reader (see the top of this file). Throws only when Firestore or FCM does. */
export async function pushPick(db: Firestore, uid: string, sender: PushSender, opts: { now?: number } = {}): Promise<PickResult> {
  const now = opts.now ?? Date.now();
  const logRef = db.doc(`${PICK_PUSHES}/${uid}`);
  const [settings, devices, stored, logSnap] = await Promise.all([
    db.doc(`${NOTIFICATION_SETTINGS}/${uid}`).get(),
    db.collection('devices').where('userId', '==', uid).get(),
    db.doc(`${RECOMMENDATIONS}/${uid}`).get(),
    logRef.get(),
  ]);
  if (!readNotificationSettings(settings.data()).picks) return { outcome: 'opted-out' };
  const targets = deviceTargets(devices.docs);
  if (!targets.length) return { outcome: 'no-device' };
  const picks = readStored(stored.data());
  // They opened their picks themselves today (a warm build ahead of them doesn't count).
  if (picks?.askedOn === recommendationDay(new Date(now))) return { outcome: 'opened-today' };
  const log = readPickLog(logSnap.data());
  const gate = pickGate(log, now);
  if (gate !== 'ok') return { outcome: gate };

  const chosen = picks?.items.length ? await chooseCard(db, uid, picks.items, log, now) : null;
  if (!chosen) return { outcome: 'no-card' };
  const { card, reason } = chosen;
  if (!(await claimPick(logRef, card.id, now))) return { outcome: 'claimed', cardId: card.id };

  // No notificationId: no bell row stands behind it (see lib/push/chat on why an empty one is worse than none).
  const data = { type: 'pick', cardId: card.id, route: cardRoute(card) };
  let sent = 0;
  const dead: DocumentReference[] = [];
  for (const [locale, group] of groupByLocale(targets)) {
    const text = pickText(locale, String(card.thoughtCore), reason);
    const result = await multicastTo(sender, group, (tokens) => ({
      tokens,
      notification: text,
      data,
      // One evening's card replaces the last one's.
      android: { notification: { channelId: PICKS_CHANNEL, tag: PICKS_CHANNEL } },
      apns: { payload: { aps: { sound: 'default', threadId: PICKS_CHANNEL } } },
    }));
    sent += result.sent;
    dead.push(...result.dead);
  }
  await forgetDevices(db, dead);
  return { outcome: 'sent', cardId: card.id, sent };
}

export interface PickRun {
  /** Readers with the switch on that the run reached. */
  readers: number;
  outcomes: Partial<Record<PickOutcome | 'failed', number>>;
  /** Readers left for lack of time. */
  deferred: number;
}

/**
 * The evening's run: every reader with `picks` on, a few at a time, starting
 * none past `deadline` (ms on `clock`); one reader's failure is logged and
 * the rest go on. The walk starts at the day's point in the user ids
 * (dailyWalkStart) and goes round, so the readers a run has no time for
 * aren't the same ones every day.
 */
export async function pushPicks(
  db: Firestore,
  sender: PushSender,
  opts: { now?: number; deadline?: number; clock?: () => number; concurrency?: number } = {},
): Promise<PickRun> {
  const clock = opts.clock ?? Date.now;
  const now = opts.now ?? clock();
  const stop = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const run: PickRun = { readers: 0, outcomes: {}, deferred: 0 };
  const tally = (o: PickOutcome | 'failed') => (run.outcomes[o] = (run.outcomes[o] ?? 0) + 1);
  for await (const uids of optedIn(db, 'picks', { from: dailyWalkStart(now) })) {
    if (stop()) {
      run.deferred += uids.length;
      continue;
    }
    run.readers += uids.length;
    const { notStarted } = await runPool(
      uids,
      opts.concurrency ?? CONCURRENCY,
      (uid) => pushPick(db, uid, sender, { now }).then((r) => tally(r.outcome), (e) => (tally('failed'), Promise.reject(e))),
      { stop, tag: '[push-picks]' },
    );
    run.readers -= notStarted;
    run.deferred += notStarted;
  }
  if (run.deferred) console.warn(`[push-picks] out of time: ${run.deferred} readers left (tomorrow's walk starts elsewhere)`);
  return run;
}
