'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { wavyLine } from '@/lib/design/wavyPath';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile } from '@/lib/data/hooks';
import { Link } from '@/i18n/navigation';
import { NAV_KEYS } from './SiteHeader';
import styles from './MobileNavModal.module.css';

export interface MobileNavModalProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNavModal({ open, onClose }: MobileNavModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const dividerD = useMemo(() => wavyLine(260, 53, 1.3, 7), []);
  const t = useTranslations('nav');
  const locale = useLocale();
  const { user, loading } = useAuth();
  const { data: profile } = useMyProfile();
  return (
    <Modal open={open} onClose={onClose} maxWidth={380} seed={53} ariaLabel={t('siteNav')} padding="24px 28px 28px">
      <div className={styles.brandRow}>
        <ResonanceIcon size={28} />
        <span className={styles.brandText}>Resonance</span>
      </div>

      {NAV_KEYS.length > 0 && (
        <nav className={styles.nav}>
          {NAV_KEYS.map((key) => (
            <a
              key={key}
              href={`/${locale}/#${key}`}
              onClick={(e) => {
                const el = document.getElementById(key);
                if (el && window.location.pathname.replace(/\/$/, '') === `/${locale}`) {
                  e.preventDefault();
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                onClose();
              }}
              className={styles.navLink}
            >
              {t(key)}
            </a>
          ))}
        </nav>
      )}

      <svg viewBox="0 0 260 6" preserveAspectRatio="none" aria-hidden="true" className={styles.divider}>
        <path
          d={dividerD}
          transform="translate(0,3)"
          stroke="oklch(55% 0.05 60 / 0.35)"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className={styles.footer}>
        {mounted && !loading && (
          <>
            {!user ? (
              <Link href="/signin" onClick={onClose} style={{ textDecoration: 'none' }}>
                <OrganicButton variant="outline" style={{ padding: '10px 22px', fontSize: 14 }}>
                  {t('signIn')}
                </OrganicButton>
              </Link>
            ) : (
              <Link href="/me" onClick={onClose} aria-label="My Profile" style={{ textDecoration: 'none' }}>
                <HandDrawnAvatar
                  src={profile?.avatarUrl}
                  initials={profile?.initials || '··'}
                  size={38}
                  color={profile?.accentColor || 'var(--color-terracotta-light)'}
                  seed={Number(profile?.avatarSeed) || 77}
                />
              </Link>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
