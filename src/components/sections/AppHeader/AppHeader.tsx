'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { HamburgerIcon } from '@/components/atoms/HamburgerIcon/HamburgerIcon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAppChrome } from '@/components/providers/AppChrome';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { Link, usePathname } from '@/i18n/navigation';
import { NotificationBell } from './NotificationBell';
import { MessagesEntry } from './MessagesEntry';
import { WriteEntry } from './WriteEntry';
import { AppMobileNavModal } from './AppMobileNavModal';
import { Subnavbar } from './Subnavbar';
import { HeaderBar } from './HeaderBar';
import { HeaderChrome, HEADER_BODY_H, HEADER_OVERLAY_ID, HEADER_TOTAL_H } from './HeaderChrome';
import styles from './AppHeader.module.css';

export interface AppHeaderProps {
  user: {
    initials: string;
    handle: string;
    accentColor: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };
  /** Whether a viewer is signed in. When false the account slot shows 登入. */
  signedIn?: boolean;
  /**
   * Whether client auth has resolved. While false we render no account
   * controls, so the avatar/登入 toggle never flashes the wrong state.
   */
  authReady?: boolean;
  activeKey?: 'home' | 'me' | 'write';
}

export function AppHeader({ user, signedIn = true, authReady = true, activeKey }: AppHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Phone or wide is the module CSS's to decide (720px; the thread's 900px):
  // the server's HTML is then already right. This only closes the menu.
  const isMobile = useIsMobile(720);
  const tNav = useTranslations('app.nav');
  const { mobileHeader } = useAppChrome();
  const pathname = usePathname();
  // The messages surface borrows the brand slot as its page title — the
  // two-pane layout owns the full height, so no in-page heading exists.
  const onMessages = pathname === '/messages' || pathname.startsWith('/messages/');
  const onThread = pathname.startsWith('/messages/');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  // Phones open the menu from here; wider screens have the sign-in button or
  // the account dropdown instead (the module CSS hides it there).
  const menuButton = (
    <button
      aria-label={tNav('openMenu')}
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen(true)}
      className={`${styles.menuBtn} ${styles.phoneOnly}`}
      style={{ padding: 6, transform: 'translateY(3px)' }}
    >
      <HamburgerIcon size={22} />
    </button>
  );

  // A page (e.g. a settings detail screen) can claim the header on phones: just
  // a back control + the current screen's title, no brand or account controls.
  if (mobileHeader) {
    return <HeaderBar title={mobileHeader.title} backLabel={tNav('back')} onBack={mobileHeader.onBack} scrolled={scrolled} />;
  }

  return (
    // Single-pane phones give an open conversation the whole screen: the app
    // header steps aside (the module CSS, 900px — MessagesPage's breakpoint)
    // and the thread's own header (back + person) takes over.
    <header className={styles.header} style={{ height: HEADER_TOTAL_H }} data-on-thread={onThread || undefined}>
      <HeaderChrome scrolled={scrolled} />
      <div id={HEADER_OVERLAY_ID} className={styles.overlay} />

      <div className={styles.row} style={{ height: HEADER_BODY_H }}>
        <Link href="/home" className={styles.logo}>
          <ResonanceIcon size={38} />
          <span className={styles.brand}>{onMessages ? tNav('messages') : 'Resonance'}</span>
        </Link>

        {/* Hold the slot until auth resolves so the avatar/登入 toggle never
            flashes the wrong state on first paint. */}
        {!authReady ? (
          <div className={styles.account} />
        ) : !signedIn ? (
          <div className={styles.account}>
            {/* Desktop: login button visible directly (no hamburger menu).
                Mobile: login lives inside the hamburger modal instead. */}
            <Link href="/signin" className={styles.wideOnly} style={{ textDecoration: 'none' }}>
              <OrganicButton variant="solid" style={{ padding: '9px 22px', fontSize: 14 }}>
                {tNav('signIn')}
              </OrganicButton>
            </Link>
            {/* Signed-out phones still get the menu — the 共振 Feed entry
                (and the 登入 shortcut) live in the same modal as always. */}
            {menuButton}
          </div>
        ) : (
          <div className={styles.account}>
            <WriteEntry />
            <MessagesEntry />
            <NotificationBell />
            {menuButton}
            <div className={styles.wideOnly}>
              <Subnavbar user={user} />
            </div>
          </div>
        )}
      </div>

      <AppMobileNavModal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={signedIn ? user : undefined}
        activeKey={activeKey}
      />
    </header>
  );
}

