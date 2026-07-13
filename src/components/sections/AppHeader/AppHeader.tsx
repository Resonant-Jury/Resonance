'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { HamburgerIcon } from '@/components/atoms/HamburgerIcon/HamburgerIcon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { useAppChrome } from '@/components/providers/AppChrome';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { Link, usePathname } from '@/i18n/navigation';
import { NotificationBell } from './NotificationBell';
import { MessagesEntry } from './MessagesEntry';
import { AppMobileNavModal } from './AppMobileNavModal';
import { Subnavbar } from './Subnavbar';
import styles from './AppHeader.module.css';

const HEADER_BODY_H = 68;
const HEADER_WAVE_H = 14;
const HEADER_TOTAL_H = HEADER_BODY_H + HEADER_WAVE_H;
// Y of the wavy bottom stroke — the visible bottom edge of the header chrome.
// Centering content within 0…HEADER_STROKE_Y puts it on the visible bar's
// midpoint (rather than the top HEADER_BODY_H, which reads a couple px high).
const HEADER_STROKE_Y = HEADER_BODY_H + HEADER_WAVE_H * 0.35;

function buildHeaderPaths(seed: number) {
  const W = 1440;
  const baseY = HEADER_STROKE_Y;
  const amp = 1.4;
  const steps = 12;
  const pts = wavyPoints(W, baseY, amp, seed, steps);
  const strokeD = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let maskD = `M 0,0 L ${W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    maskD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  maskD += ' Z';
  return { maskD, strokeD, W };
}

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
  const isMobile = useIsMobile(720);
  // Matches MessagesPage's single-pane CSS breakpoint (900px), not the
  // hamburger breakpoint — the two must flip together.
  const isSinglePane = useIsMobile(900);
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

  const { maskD, strokeD, W } = useMemo(() => buildHeaderPaths(211), []);
  const maskUrl = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${HEADER_TOTAL_H}' preserveAspectRatio='none'><path d='${maskD}' fill='white'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [maskD, W]);

  // Single-pane phones give an open conversation the whole screen: the app
  // header steps aside and the thread's own header (back + person) takes over.
  if (isSinglePane && onThread) return null;

  // Shared wavy backdrop + bottom stroke — reused by the normal header and the
  // mobile takeover so they read as the exact same chrome.
  const chromeBg = (
    <>
      <div
        aria-hidden="true"
        className={styles.bg}
        style={{ opacity: scrolled ? 1 : 0.82, WebkitMaskImage: maskUrl, maskImage: maskUrl }}
      />
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${W} ${HEADER_TOTAL_H}`}
        preserveAspectRatio="none"
        className={styles.waveStroke}
        style={{ height: HEADER_TOTAL_H, opacity: scrolled ? 1 : 0.5 }}
      >
        <path
          d={strokeD}
          fill="none"
          stroke="var(--field-border-hover)"
          strokeWidth={INK}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );

  // A page (e.g. a settings detail screen) can claim the header on phones: just
  // a back control + the current screen's title, no brand or account controls.
  if (mobileHeader) {
    return (
      <header className={styles.header} style={{ height: HEADER_TOTAL_H }}>
        {chromeBg}
        <div className={`${styles.row} ${styles.takeoverRow}`} style={{ height: HEADER_STROKE_Y }}>
          <button
            type="button"
            className={styles.backBtn}
            aria-label={tNav('back')}
            onClick={mobileHeader.onBack}
          >
            {/* translateY optically centres the arrow against the serif title,
                whose ink sits a hair below its line-box centre. */}
            <span style={{ display: 'inline-flex', transform: 'scaleX(-1) translateY(1px)' }}>
              <Icon name="arrow-right" size={18} />
            </span>
          </button>
          <span className={styles.brand}>{mobileHeader.title}</span>
        </div>
      </header>
    );
  }

  return (
    <header className={styles.header} style={{ height: HEADER_TOTAL_H }}>
      {chromeBg}

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
            <Link href="/signin" style={{ textDecoration: 'none' }}>
              <OrganicButton variant="outline" style={{ padding: '9px 22px', fontSize: 14 }}>
                {tNav('signIn')}
              </OrganicButton>
            </Link>
          </div>
        ) : isMobile ? (
          <div className={styles.account}>
            <MessagesEntry />
            <NotificationBell />
            <button
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className={styles.menuBtn}
              style={{
                padding: 6,
                transform: 'translateY(3px)',
              }}
            >
              <HamburgerIcon size={22} />
            </button>
          </div>
        ) : (
          <div className={styles.account}>
            <MessagesEntry />
            <NotificationBell />
            <Subnavbar user={user} />
          </div>
        )}
      </div>

      {signedIn && (
        <AppMobileNavModal
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          user={user}
          activeKey={activeKey}
        />
      )}
    </header>
  );
}

export { HEADER_TOTAL_H };
