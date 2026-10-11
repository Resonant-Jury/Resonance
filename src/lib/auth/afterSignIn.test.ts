// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const profile = vi.hoisted(() => ({ getCurrentUserHandle: vi.fn() }));
vi.mock('@/lib/db/firestore/client/profile', () => profile);

import { afterSignupPath, destinationAfterSignIn, isAuthPage, signupProfilePath } from './afterSignIn';

beforeEach(() => vi.clearAllMocks());

// A first sign-in goes straight to the sign-up's profile step; it used to
// open the feed first and be sent on from there — a page and a hop for nothing.
describe('where a reader goes after signing in', () => {
  it('sends an account without a pen name to the profile step, carrying next', async () => {
    profile.getCurrentUserHandle.mockResolvedValue(null);
    expect(await destinationAfterSignIn('en', null)).toBe('/en/signup?step=profile');
    expect(await destinationAfterSignIn('zh-TW', '/zh-TW/write')).toBe(
      `/zh-TW/signup?step=profile&next=${encodeURIComponent('/zh-TW/write')}`,
    );
    profile.getCurrentUserHandle.mockResolvedValue('   ');
    expect(await destinationAfterSignIn('en', null)).toBe('/en/signup?step=profile');
  });

  it('sends an account with a pen name to next, else the feed', async () => {
    profile.getCurrentUserHandle.mockResolvedValue('Nian');
    expect(await destinationAfterSignIn('en', '/en/messages')).toBe('/en/messages');
    expect(await destinationAfterSignIn('en', null)).toBe('/en/home');
    // A next that would leave the site is not one.
    expect(await destinationAfterSignIn('en', '//evil.example')).toBe('/en/home');
  });

  it('falls back to next when the pen name cannot be read (the shell checks again)', async () => {
    profile.getCurrentUserHandle.mockRejectedValue(new Error('offline'));
    expect(await destinationAfterSignIn('en', '/en/write')).toBe('/en/write');
  });

  it('never carries an off-site next to the profile step', () => {
    expect(signupProfilePath('en', 'https://evil.example/x')).toBe('/en/signup?step=profile');
  });
});

describe('the sign-in pages, by address', () => {
  it('knows them with or without the locale, on this site only', () => {
    expect(isAuthPage(`${window.location.origin}/zh-TW/signup?step=profile`)).toBe(true);
    expect(isAuthPage('/en/signin?next=%2Fen%2Fwrite')).toBe(true);
    expect(isAuthPage('/signup')).toBe(true);
    expect(isAuthPage('/en/home')).toBe(false);
    expect(isAuthPage('/en/signupx')).toBe(false);
    expect(isAuthPage('https://elsewhere.example/en/signin')).toBe(false);
    expect(isAuthPage(null)).toBe(false);
  });
});

describe('where the sign-up goes when done', () => {
  it('marks the writer as a new account’s first card, and leaves any other page as it is', () => {
    expect(afterSignupPath('/en/write')).toBe('/en/write?from=signup');
    expect(afterSignupPath('/zh-TW/write?ref=abc')).toBe('/zh-TW/write?ref=abc&from=signup');
    expect(afterSignupPath('/en/messages')).toBe('/en/messages');
    expect(afterSignupPath('/en/writers')).toBe('/en/writers');
  });
});

