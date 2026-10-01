'use client';

import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { AppMobileNavModal } from '@/components/sections/AppHeader/AppMobileNavModal';
import { Link } from '@/i18n/navigation';
import { useMyProfile } from '@/lib/data/hooks';
import { AVATAR_PLACEHOLDER as PLACEHOLDER } from './avatarPlaceholder';

/*
 * The signed-in half of SiteHeader: what needs the viewer's profile, and so
 * the data layer. SiteHeader loads this module only once someone is signed
 * in, so the landing and policy pages a signed-out visitor sees never load
 * Firestore.
 */

/** The signed-in viewer's avatar, linking to their page. */
export function SiteHeaderAvatar() {
  const { data: profile } = useMyProfile();
  return (
    <Link href="/me" aria-label="My Profile" style={{ textDecoration: 'none' }}>
      <HandDrawnAvatar
        src={profile?.avatarUrl}
        initials={profile?.initials || PLACEHOLDER.initials}
        size={36}
        color={profile?.accentColor || PLACEHOLDER.color}
        seed={Number(profile?.avatarSeed) || PLACEHOLDER.seed}
      />
    </Link>
  );
}

/** The mobile menu for a signed-in viewer: their identity on top once their profile is in. */
export function SiteHeaderSignedInNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: profile } = useMyProfile();
  return (
    <AppMobileNavModal
      open={open}
      onClose={onClose}
      user={
        profile
          ? {
              initials: profile.initials || PLACEHOLDER.initials,
              handle: profile.handle || '',
              accentColor: profile.accentColor || PLACEHOLDER.color,
              avatarUrl: profile.avatarUrl,
              avatarSeed: profile.avatarSeed,
            }
          : undefined
      }
    />
  );
}
