// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => router }));

import { useLeaveWriter } from './useLeaveWriter';

const w = window as unknown as { navigation?: unknown };

function withHistory(previous: string | null) {
  w.navigation = {
    canGoBack: previous !== null,
    currentEntry: { index: previous === null ? 0 : 1 },
    entries: () => (previous === null ? [{ url: location.href }] : [{ url: previous }, { url: location.href }]),
  };
}

afterEach(() => {
  delete w.navigation;
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

describe('the writer’s way out', () => {
  it('goes back where the writer came from', () => {
    withHistory(`${location.origin}/en/card/what-is-money`);
    renderHook(() => useLeaveWriter('/home')).result.current();
    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the fallback when there is nothing of ours to go back to', () => {
    withHistory(null);
    renderHook(() => useLeaveWriter('/home')).result.current();
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  // A new account is sent from the sign-up to write its first card; leaving
  // it — or saving it for later — went back to the sign-up (which showed its
  // form again, its button working for ever). The first card can wait: the feed.
  it('opens the fallback, not the sign-up, when the writer came from signing up or in', () => {
    withHistory(`${location.origin}/zh-TW/signup?step=profile`);
    renderHook(() => useLeaveWriter('/home')).result.current();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/home');

    vi.clearAllMocks();
    withHistory(`${location.origin}/en/signin?next=%2Fen%2Fwrite`);
    renderHook(() => useLeaveWriter('/home')).result.current();
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  // The sign-up opens the writer for a new account's first card. Leaving it,
  // or saving it for later, opens the feed — not the page before the sign-up
  // (the landing page), which a step back would.
  it('opens the feed from a new account’s first card, however it leaves', () => {
    window.history.replaceState(null, '', '/zh-TW/write?from=signup');
    withHistory(`${location.origin}/zh-TW`);
    renderHook(() => useLeaveWriter('/home')).result.current();
    renderHook(() => useLeaveWriter('/me')).result.current();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace.mock.calls).toEqual([['/home'], ['/home']]);
  });
});
