'use client';

import { SWRConfig, type SWRConfiguration } from 'swr';

/**
 * App-wide SWR defaults.
 *
 * - No refetch on tab focus: coming back to the tab used to re-run every
 *   mounted fetcher — feeds, card pages, the recommendation API, the
 *   account-deletion status, multi-step read chains. What must stay live opts
 *   back in on its own hook (conversations, the block list); the open thread
 *   is a realtime listener anyway.
 * - A mount within 30 s of the same fetch reuses it, so going back and forth
 *   between the feed and a card doesn't read everything again. Hooks for what
 *   the viewer edits themselves (their card, card box, profile) keep SWR's
 *   short default so their own writes show up at once.
 *
 * Deliberately not `keepPreviousData`: across keys it would show card A's
 * content at card B's URL, and a private card after signing out.
 */
export const SWR_DEFAULTS: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
};

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={SWR_DEFAULTS}>{children}</SWRConfig>;
}
