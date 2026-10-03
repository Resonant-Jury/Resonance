'use client';

import { useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * Leaves the writer for wherever the writer came from — or, opened in a tab
 * of its own (a bookmark, a pasted address, a Write link opened in a new
 * tab: nothing in this tab to go back to), for `fallback`, so the way out
 * never does nothing.
 */
export function useLeaveWriter(fallback: '/home' | '/me'): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
