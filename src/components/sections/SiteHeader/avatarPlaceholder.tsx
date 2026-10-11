'use client';

import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';

/** How a signed-in viewer's avatar looks before their profile has loaded. */
export const AVATAR_PLACEHOLDER = { initials: '··', color: 'var(--color-terracotta-light)', seed: 77 } as const;

/**
 * The header avatar while the signed-in half of the header (./SiteHeaderAccount)
 * loads: a still face in the menu's place, not a link (the avatar opens the
 * account menu once it is in, never a page).
 */
export function SiteHeaderAvatarPlaceholder() {
  return (
    <span aria-hidden style={{ display: 'inline-flex' }}>
      <HandDrawnAvatar
        initials={AVATAR_PLACEHOLDER.initials}
        size={36}
        color={AVATAR_PLACEHOLDER.color}
        seed={AVATAR_PLACEHOLDER.seed}
      />
    </span>
  );
}
