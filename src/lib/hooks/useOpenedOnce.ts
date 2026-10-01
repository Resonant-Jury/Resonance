'use client';

import { useState } from 'react';

/**
 * True from the first time `open` is true, and from then on. A dialog loaded
 * with next/dynamic renders behind this: its code is fetched when it is first
 * opened rather than with the page, and it then stays mounted between
 * openings exactly as a statically imported one did.
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}
