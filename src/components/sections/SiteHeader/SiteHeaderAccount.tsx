'use client';

import { AppMobileNavModal } from '@/components/sections/AppHeader/AppMobileNavModal';
import { Subnavbar } from '@/components/sections/AppHeader/Subnavbar';
import { useMyProfile } from '@/lib/data/hooks';
import { AVATAR_PLACEHOLDER as PLACEHOLDER } from './avatarPlaceholder';

/*
 * The signed-in half of SiteHeader: what needs the viewer's profile, and so
 * the data layer. SiteHeader loads this module only once someone is signed
 * in, so the landing and policy pages a signed-out visitor sees never load
 * Firestore.
 */

/**
 * The signed-in viewer's avatar and the account menu it opens — the app
 * header's own (Subnavbar: 我的卡片盒 / 私訊 / 設定 / 登出), so the avatar does the
 * same on the landing and policy pages as everywhere else.
 */
export function SiteHeaderAccountMenu() {
  const { data: profile } = useMyProfile();
  return (
    <Subnavbar
      user={{
        initials: profile?.initials || PLACEHOLDER.initials,
        handle: profile?.handle || '',
        accentColor: profile?.accentColor || PLACEHOLDER.color,
        avatarUrl: profile?.avatarUrl,
        avatarSeed: profile?.avatarSeed ?? String(PLACEHOLDER.seed),
      }}
    />
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
