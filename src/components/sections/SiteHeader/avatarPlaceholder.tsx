'use client';

import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Link } from '@/i18n/navigation';

/** How a signed-in viewer's avatar looks before their profile has loaded. */
export const AVATAR_PLACEHOLDER = { initials: '··', color: 'var(--color-terracotta-light)', seed: 77 } as const;

/** The header avatar while the signed-in half of the header (./SiteHeaderAccount) loads. */
export function SiteHeaderAvatarPlaceholder() {
  return (
    <Link href="/me" aria-label="My Profile" style={{ textDecoration: 'none' }}>
      <HandDrawnAvatar
        initials={AVATAR_PLACEHOLDER.initials}
        size={36}
        color={AVATAR_PLACEHOLDER.color}
        seed={AVATAR_PLACEHOLDER.seed}
      />
    </Link>
  );
}
