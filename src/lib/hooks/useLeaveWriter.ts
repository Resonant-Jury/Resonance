'use client';

import { useCallback, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { FROM_SIGNUP, isAuthPage } from '@/lib/auth/afterSignIn';

interface NavigationLike {
  canGoBack?: unknown;
  currentEntry?: { index: number } | null;
  entries?: () => { url: string | null }[];
}

function navigationApi(): NavigationLike | undefined {
  return (window as { navigation?: NavigationLike }).navigation;
}

/**
 * Whether this tab has a page of ours to go back to. The Navigation API
 * knows (it counts this site's entries before this one); without it, a tab
 * whose history holds this page alone has none.
 */
export function canGoBack(): boolean {
  const nav = navigationApi();
  return typeof nav?.canGoBack === 'boolean' ? nav.canGoBack : window.history.length > 1;
}

/**
 * The page before this one in the tab, where the Navigation API tells (null
 * where it doesn't: the sign-in pages leave the history as they finish, so
 * one is rarely there to find).
 */
function previousPage(): string | null {
  const nav = navigationApi();
  const current = nav?.currentEntry;
  if (current && typeof nav?.entries === 'function') {
    return nav.entries()[current.index - 1]?.url ?? null;
  }
  return null;
}

/**
 * Leaves the writer for wherever the writer came from — or, opened in a tab
 * of its own (a bookmark, a pasted address, a Write link opened in a new
 * tab, or stepped back to as the tab's first page: nothing of ours to go
 * back to), for `fallback`, so the way out never does nothing. A new
 * account's first card (the sign-up opens the writer `from=signup`) can
 * wait: its way out — leaving, or saving it for later — opens the feed, never
 * the page before the sign-up (nor the sign-up itself, should one of the
 * sign-in pages still be the page before).
 */
export function useLeaveWriter(fallback: '/home' | '/me'): () => void {
  const router = useRouter();
  // Read as the writer opens: its first save rewrites the address without the query.
  const [fromSignup] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === FROM_SIGNUP,
  );
  return useCallback(() => {
    if (fromSignup) router.replace('/home');
    else if (canGoBack() && !isAuthPage(previousPage())) router.back();
    else router.replace(fallback);
  }, [router, fallback, fromSignup]);
}
