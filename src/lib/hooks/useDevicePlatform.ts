'use client';

import { useSyncExternalStore } from 'react';
import { devicePlatform, type DevicePlatform } from '@/lib/appStores';

const never = () => () => {};

/**
 * The visitor's device platform (src/lib/appStores), `null` until it can be
 * known: the server render and hydration see `null`, so they match, and the
 * first render after hydration has the answer. A device never changes, so
 * nothing is subscribed.
 */
export function useDevicePlatform(): DevicePlatform | null {
  return useSyncExternalStore(
    never,
    () => devicePlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  );
}
