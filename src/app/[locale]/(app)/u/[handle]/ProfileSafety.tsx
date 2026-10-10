'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useSafetyActions } from '@/components/molecules/SafetyActions/useSafetyActions';
import { unblockUser } from '@/lib/db/firestore/client/blocks';
import { seedFromString } from '@/lib/design/prng';
import type { User } from '@/lib/db/types';
import styles from './page.module.css';

/**
 * The「⋯」after the profile's pen name: report / block this person. A bare
 * glyph (no chip) whose tooltip and accessible name say what it holds.
 */
export function ProfileSafetyMenu({ user, isBlocked }: { user: User; isBlocked: boolean }) {
  const safety = useSafetyActions({
    report: { type: 'user', id: user.id, userId: user.id, handle: user.handle },
    isBlocked,
  });
  return (
    <div className={styles.heroMenu}>
      <OrganicMenu
        label={safety.label}
        seed={seedFromString(user.id)}
        bare
        items={safety.items}
        onChoose={(key) => safety.choose(key)}
      />
      {safety.modals}
    </div>
  );
}

/** Replaces the profile's cards when the viewer has blocked this person. */
export function BlockedNotice({ user }: { user: User }) {
  const t = useTranslations('safety');
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);

  async function unblock() {
    if (busy) return;
    setBusy(true);
    try {
      await unblockUser(user.id);
      void mutate(() => true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.blockedNotice} aria-live="polite">
      <p className={styles.blockedTitle}>{t('blockedNotice', { handle: user.handle })}</p>
      <p className={styles.blockedBody}>{t('blockedNoticeBody')}</p>
      <div>
        <OrganicButton variant="textAccent" size="sm" onClick={() => void unblock()} loading={busy}>
          {t('unblock')}
        </OrganicButton>
      </div>
    </section>
  );
}
