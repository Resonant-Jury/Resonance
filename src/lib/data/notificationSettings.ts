'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import { callApi } from '@/lib/db/firestore/client/api';
import type { NotificationSettingsBody } from '@/lib/api/v1/schemas';

export type NotificationSwitch = keyof NotificationSettingsBody;

const PATH = '/api/v1/me/notifications';

export interface NotificationSettingsState {
  /** The switches as the server has them (or as just flipped); undefined while loading. */
  data: NotificationSettingsBody | undefined;
  /** Reading them failed (SWR tries again). */
  loadFailed: boolean;
  /** The last flip didn't save (and was undone). */
  saveFailed: boolean;
  /** Flip one switch: shown at once, undone if the server refuses. */
  set: (name: NotificationSwitch, on: boolean) => Promise<void>;
}

/**
 * The viewer's push switches (GET/PATCH /api/v1/me/notifications), keyed per
 * viewer so another account signed in on this browser never sees them. A
 * flip shows at once and is undone if it doesn't save.
 */
export function useNotificationSettings(): NotificationSettingsState {
  const { user } = useAuth();
  const key = user ? `notifications:${user.id}` : null;
  const { data, error, mutate } = useSWR<NotificationSettingsBody>(key, () => callApi<NotificationSettingsBody>(PATH), {
    dedupingInterval: 2_000,
  });
  const [saveFailed, setSaveFailed] = useState(false);

  const set = useCallback(
    async (name: NotificationSwitch, on: boolean) => {
      if (!key) return;
      setSaveFailed(false);
      try {
        await mutate(() => callApi<NotificationSettingsBody>(PATH, { method: 'PATCH', body: { [name]: on } }), {
          optimisticData: (current) => ({ picks: false, connectionCards: false, ...current, [name]: on }),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        });
      } catch {
        setSaveFailed(true);
      }
    },
    [key, mutate],
  );

  return { data, loadFailed: !!error && !data, saveFailed, set };
}
