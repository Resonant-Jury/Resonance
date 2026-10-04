'use client';

import { useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * Whether this tab has a page of ours to go back to. The Navigation API
 * knows (it counts this site's entries before this one); without it, a tab
 * whose history holds this page alone has none.
 */
export function canGoBack(): boolean {
  const nav = (window as { navigation?: { canGoBack?: unknown } }).navigation;
  return typeof nav?.canGoBack === 'boolean' ? nav.canGoBack : window.history.length > 1;
}

/**
 * Leaves the writer for wherever the writer came from — or, opened in a tab
 * of its own (a bookmark, a pasted address, a Write link opened in a new
 * tab, or stepped back to as the tab's first page: nothing of ours to go
 * back to), for `fallback`, so the way out never does nothing.
 */
export function useLeaveWriter(fallback: '/home' | '/me'): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
