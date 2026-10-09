import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { timeZoneOf } from './devices';
import { PICKS_PER_WEEK, cardRoute, pickGate, pickText, readPickLog, recentlyPushed, type PickLog } from './picks';
import { dailyWalkStart, readNotificationSettings } from './settings';

// The pure rules of "a card for tonight" and its switches (Firestore and FCM:
// test/emulator/pushPicks.emulator.test.ts).

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const log = (sentAt: number[], recent: PickLog['recent'] = []): PickLog => ({ sentAt, recent });

describe('pickGate', () => {
  it('lets one pick push go a (UTC) day', () => {
    expect(pickGate(log([]), NOW)).toBe('ok');
    expect(pickGate(log([Date.parse('2026-10-05T00:30:00Z')]), NOW)).toBe('sent-today');
    expect(pickGate(log([Date.parse('2026-10-04T23:59:00Z')]), NOW)).toBe('ok');
  });

  it(`stops at ${PICKS_PER_WEEK} in the seven days ending today, whatever minute the cron fires`, () => {
    // Days 1–3 of the window: the fourth waits.
    const three = [NOW - 6 * DAY + 60_000, NOW - 5 * DAY, NOW - 4 * DAY];
    expect(pickGate(log(three), NOW)).toBe('week-cap');
    // A week on, the first has left the window — even when today's run fires a minute earlier than that day's did.
    expect(pickGate(log([NOW - 7 * DAY + 60_000, NOW - 5 * DAY, NOW - 4 * DAY]), NOW)).toBe('ok');
    expect(pickGate(log([NOW - 5 * DAY, NOW - 4 * DAY]), NOW)).toBe('ok');
  });
});

describe('readPickLog / recentlyPushed', () => {
  it('reads the log defensively and remembers a card for 30 days', () => {
    const data = {
      recent: [
        { cardId: 'old', at: Timestamp.fromMillis(NOW - 31 * DAY) },
        { cardId: 'new', at: Timestamp.fromMillis(NOW - 29 * DAY) },
        { cardId: 7, at: Timestamp.fromMillis(NOW) },
        null,
      ],
      sentAt: [Timestamp.fromMillis(NOW - DAY), 'yesterday'],
    };
    const read = readPickLog(data);
    expect(read).toEqual({ recent: [{ cardId: 'old', at: NOW - 31 * DAY }, { cardId: 'new', at: NOW - 29 * DAY }], sentAt: [NOW - DAY] });
    expect([...recentlyPushed(read, NOW)]).toEqual(['new']);
    expect(readPickLog(undefined)).toEqual({ recent: [], sentAt: [] });
  });
});

describe('pickText', () => {
  it("gives a Chinese device the recommender's reason and an English one its own line — never a name", () => {
    expect(pickText('zh-TW', '  走路的時候  ', '因為你也寫過散步')).toEqual({ title: '今晚的一張卡片', body: '走路的時候\n因為你也寫過散步' });
    expect(pickText('en', 'A walk', '因為你也寫過散步')).toEqual({ title: 'A card for tonight', body: 'A walk\nA card that might resonate with you' });
    // A quick pass without a reason: the line every language has.
    expect(pickText('zh-TW', '走路', ' ').body).toBe('走路\n一張可能與你共振的卡片');
  });

  it('cuts a long title by code points, never through an emoji', () => {
    const title = '🌙'.repeat(70);
    expect(Array.from(pickText('en', title, '').body.split('\n')[0])).toHaveLength(60);
    expect(pickText('en', title, '').body.split('\n')[0]).toBe('🌙'.repeat(60));
  });
});

describe('cardRoute', () => {
  it("opens the card at its slug, else its id — paths both apps' routers already know", () => {
    expect(cardRoute({ id: 'c1', slug: 'a-walk' })).toBe('/card/a-walk');
    expect(cardRoute({ id: 'c1', slug: null })).toBe('/card/c1');
    expect(cardRoute({ id: 'c1', slug: '' })).toBe('/card/c1');
  });
});

describe('readNotificationSettings', () => {
  it('reads anything but true as off — a missing document is both off', () => {
    expect(readNotificationSettings(undefined)).toEqual({ picks: false, connectionCards: false });
    expect(readNotificationSettings({ picks: true, connectionCards: 'yes' })).toEqual({ picks: true, connectionCards: false });
  });
});

describe('dailyWalkStart', () => {
  it('starts the crons\' walk at one point all day, a different one each day, spread over the user ids', () => {
    // The warm-up (11:00) and the push (12:00) start at the same point; the next day elsewhere.
    expect(dailyWalkStart(Date.parse('2026-10-05T11:00:00Z'))).toBe(dailyWalkStart(Date.parse('2026-10-05T12:59:00Z')));
    const starts = Array.from({ length: 60 }, (_, d) => dailyWalkStart(NOW + d * DAY));
    expect(new Set(starts).size).toBe(60);
    for (const s of starts) expect(s).toMatch(/^[0-9A-Za-z]{8}$/);
    // Not stuck in one stretch of the ids: the first characters land all over.
    expect(new Set(starts.map((s) => s[0])).size).toBeGreaterThan(25);
  });
});

describe('timeZoneOf', () => {
  it('keeps an IANA name the runtime knows, in its own spelling', () => {
    expect(timeZoneOf('Asia/Taipei')).toBe('Asia/Taipei');
    expect(timeZoneOf(' asia/taipei ')).toBe('Asia/Taipei');
    expect(timeZoneOf('UTC')).toBe('UTC');
    expect(timeZoneOf('Etc/GMT+8')).toBe('Etc/GMT+8');
  });

  it('keeps nothing else — an offset, an unknown zone, junk — as unknown', () => {
    for (const v of ['+08:00', 'GMT+08:00', 'Mars/Olympus', '../etc', '', 'x'.repeat(65), null, 8]) expect(timeZoneOf(v)).toBeNull();
  });
});
