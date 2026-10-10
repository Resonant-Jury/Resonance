import { describe, it, expect } from 'vitest';
import { publishedDate } from './publishedDate';

describe('publishedDate', () => {
  it('names the day with its year in the reader’s language', () => {
    const at = new Date('2026-03-05T10:00:00Z');
    expect(publishedDate(at, 'zh-TW', 'UTC')).toEqual({ dateTime: '2026-03-05T10:00:00.000Z', label: '2026年3月5日' });
    expect(publishedDate(at.toISOString(), 'en', 'UTC')?.label).toBe('Mar 5, 2026');
  });

  it('takes the zone it is given: the server render says the UTC day, the reader’s browser their own', () => {
    const lateUtc = '2026-03-05T20:00:00Z';
    expect(publishedDate(lateUtc, 'en', 'UTC')?.label).toBe('Mar 5, 2026');
    expect(publishedDate(lateUtc, 'en', 'Asia/Taipei')?.label).toBe('Mar 6, 2026');
  });

  it('has nothing for a draft or a date it cannot read', () => {
    expect(publishedDate(null, 'en')).toBeNull();
    expect(publishedDate('not a date', 'en')).toBeNull();
  });
});
