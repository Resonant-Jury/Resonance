import { describe, it, expect } from 'vitest';
import { sanitizeNextPath, nextQuery } from './nextPath';

// `next` redirect handling is a security boundary: a missed case here is an
// open-redirect. These tests treat the two functions as one feature — turning
// an untrusted `?next=` value into a safe in-site redirect — and cover the
// attack shapes an attacker would actually try.
describe('sanitizeNextPath', () => {
  it('keeps a plain in-site absolute path', () => {
    expect(sanitizeNextPath('/dashboard')).toBe('/dashboard');
    expect(sanitizeNextPath('/cards/abc?tab=draft#top')).toBe('/cards/abc?tab=draft#top');
  });

  it('rejects empty / missing input', () => {
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath('')).toBeNull();
  });

  it('rejects relative paths that are not site-absolute', () => {
    expect(sanitizeNextPath('dashboard')).toBeNull();
    expect(sanitizeNextPath('./settings')).toBeNull();
    expect(sanitizeNextPath('../etc')).toBeNull();
  });

  it('rejects protocol-relative and backslash-smuggled hosts (open-redirect vectors)', () => {
    expect(sanitizeNextPath('//evil.com')).toBeNull();
    expect(sanitizeNextPath('//evil.com/path')).toBeNull();
    expect(sanitizeNextPath('/\\evil.com')).toBeNull();
  });

  it('rejects absolute URLs with a scheme', () => {
    expect(sanitizeNextPath('https://evil.com')).toBeNull();
    expect(sanitizeNextPath('javascript:alert(1)')).toBeNull();
  });
});

describe('nextQuery', () => {
  it('builds an encoded ?next= suffix for safe paths', () => {
    expect(nextQuery('/cards/abc?tab=draft')).toBe(
      `?next=${encodeURIComponent('/cards/abc?tab=draft')}`
    );
  });

  it('returns an empty string when the path is unsafe or absent', () => {
    expect(nextQuery(null)).toBe('');
    expect(nextQuery('//evil.com')).toBe('');
    expect(nextQuery('https://evil.com')).toBe('');
  });

  it('produces a suffix that round-trips back to the original path', () => {
    const original = '/a/b?x=1&y=2';
    const suffix = nextQuery(original);
    const decoded = decodeURIComponent(suffix.replace('?next=', ''));
    expect(decoded).toBe(original);
  });
});
