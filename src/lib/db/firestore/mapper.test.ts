import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  toDate,
  toNullableDate,
  fromDate,
  sanitize,
  mapCard,
  mapUser,
  mapInvite,
  mapNotification,
} from './mapper';

// These helpers guard the RSC → Client Component boundary: a Firestore
// Timestamp that survives un-sanitized cannot be serialized to the client and
// crashes the page. The tests cover the conversions that boundary depends on.
describe('toDate', () => {
  it('passes Date through unchanged', () => {
    const d = new Date('2026-01-02');
    expect(toDate(d)).toBe(d);
  });

  it('converts a Firestore Timestamp to the equivalent Date', () => {
    const d = new Date('2026-03-04T05:06:07Z');
    expect(toDate(Timestamp.fromDate(d)).getTime()).toBe(d.getTime());
  });

  it('parses string and epoch-number inputs', () => {
    expect(toDate('2026-01-01T00:00:00Z').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(toDate(0).getTime()).toBe(0);
  });

  it('falls back to the epoch for unrecognised input', () => {
    expect(toDate(undefined).getTime()).toBe(0);
    expect(toDate({}).getTime()).toBe(0);
  });
});

describe('toNullableDate', () => {
  it('returns null for null/undefined and a Date otherwise', () => {
    expect(toNullableDate(null)).toBeNull();
    expect(toNullableDate(undefined)).toBeNull();
    expect(toNullableDate(Timestamp.fromDate(new Date('2026-01-01')))).toBeInstanceOf(Date);
  });
});

describe('fromDate', () => {
  it('round-trips a Date through a Timestamp', () => {
    const d = new Date('2026-05-06T07:08:09Z');
    const ts = fromDate(d)!;
    expect(ts.toDate().getTime()).toBe(d.getTime());
  });

  it('returns null for null/undefined', () => {
    expect(fromDate(null)).toBeNull();
    expect(fromDate(undefined)).toBeNull();
  });
});

describe('sanitize', () => {
  it('recursively converts nested Timestamps to Dates', () => {
    const ts = Timestamp.fromDate(new Date('2026-01-01'));
    const input = { a: ts, nested: { b: ts }, list: [ts, { c: ts }] };
    const out = sanitize<{
      a: Date;
      nested: { b: Date };
      list: [Date, { c: Date }];
    }>(input);
    expect(out.a).toBeInstanceOf(Date);
    expect(out.nested.b).toBeInstanceOf(Date);
    expect(out.list[0]).toBeInstanceOf(Date);
    expect((out.list[1] as { c: Date }).c).toBeInstanceOf(Date);
  });

  it('preserves primitives and null', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(42)).toBe(42);
    expect(sanitize('hi')).toBe('hi');
  });

  it('rebuilds null-prototype objects into plain objects', () => {
    const weird = Object.create(null);
    weird.x = 1;
    const out = sanitize<{ x: number }>(weird);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.x).toBe(1);
  });
});

describe('document mappers', () => {
  it('mapCard injects the id and normalises the nullable publishedAt', () => {
    const card = mapCard('card-1', {
      authorId: 'u1',
      thoughtCore: 'core',
      story: 's',
      tags: [],
      publishedAt: Timestamp.fromDate(new Date('2026-02-02')),
    });
    expect(card.id).toBe('card-1');
    expect(card.publishedAt).toBeInstanceOf(Date);

    const draft = mapCard('card-2', { authorId: 'u1', publishedAt: null });
    expect(draft.publishedAt).toBeNull();
  });

  it('mapUser converts required date fields', () => {
    const user = mapUser('u1', {
      handle: 'mei',
      joinedAt: Timestamp.fromDate(new Date('2025-01-01')),
      handleChangedAt: Timestamp.fromDate(new Date('2025-06-01')),
    });
    expect(user.id).toBe('u1');
    expect(user.joinedAt).toBeInstanceOf(Date);
    expect(user.handleChangedAt).toBeInstanceOf(Date);
  });

  it('mapInvite converts createdAt and expiresAt', () => {
    const invite = mapInvite('i1', {
      fromUserId: 'a',
      toUserId: 'b',
      status: 'pending',
      createdAt: Timestamp.fromDate(new Date('2026-01-01')),
      expiresAt: Timestamp.fromDate(new Date('2026-01-08')),
    });
    expect(invite.createdAt).toBeInstanceOf(Date);
    expect(invite.expiresAt).toBeInstanceOf(Date);
  });

  it('mapNotification keeps an unread readAt as null', () => {
    const n = mapNotification('n1', {
      userId: 'u1',
      type: 'invite',
      payload: {},
      createdAt: Timestamp.fromDate(new Date('2026-01-01')),
      readAt: null,
    });
    expect(n.createdAt).toBeInstanceOf(Date);
    expect(n.readAt).toBeNull();
  });
});
