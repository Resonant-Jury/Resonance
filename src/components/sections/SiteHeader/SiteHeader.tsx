'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { HamburgerIcon } from '@/components/atoms/HamburgerIcon/HamburgerIcon';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile } from '@/lib/data/hooks';
import { MobileNavModal } from './MobileNavModal';
import { LanguageSelect } from './LanguageSelect';
import styles from './SiteHeader.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';

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

export const NAV_KEYS = [] as const;
const NAV_TARGETS: Record<(typeof NAV_KEYS)[number], string> = {};

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile(720);
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const { user, loading } = useAuth();
  const { data: profile } = useMyProfile();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  const { maskD, strokeD, W } = useMemo(() => buildHeaderPaths(211), []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    const onLanding = pathname === '/';
    if (onLanding) {
      e.preventDefault();
      const el = document.getElementById(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${target}`);
      }
    }
  };

  const maskUrl = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${HEADER_TOTAL_H}' preserveAspectRatio='none'><path d='${maskD}' fill='white'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [maskD, W]);

  return (
    <header className={styles.header} style={{ height: HEADER_TOTAL_H }}>
      <div
        aria-hidden="true"
        className={styles.bg}
        style={{
          opacity: scrolled ? 1 : 0,
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
        }}
      />

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${W} ${HEADER_TOTAL_H}`}
        preserveAspectRatio="none"
        className={styles.waveStroke}
        style={{ height: HEADER_TOTAL_H, opacity: scrolled ? 1 : 0 }}
      >
        <path
          d={strokeD}
          fill="none"
          stroke="oklch(55% 0.05 60 / 0.38)"
          strokeWidth={INK_LIGHT}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className={styles.row} style={{ height: HEADER_BODY_H }}>
        <Link href="/" className={styles.logo}>
          <ResonanceIcon size={42} />
          <span className={styles.brand}>Resonance</span>
        </Link>

        {isMobile ? (
          <div className={styles.account}>
            <LanguageSelect compact />
            <button
              aria-label={t('openMenu')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className={styles.menuBtn}
            >
              <HamburgerIcon size={26} />
            </button>
          </div>
        ) : (
          <>
            {NAV_KEYS.length > 0 && (
              <nav className={styles.nav}>
                {NAV_KEYS.map((key) => (
                  <a
                    key={key}
                    href={`/${locale}/#${NAV_TARGETS[key]}`}
                    onClick={(e) => handleNavClick(e, NAV_TARGETS[key])}
                    className={styles.navLink}
                  >
                    {t(key)}
                  </a>
                ))}
              </nav>
            )}

            <div className={styles.account}>
              <LanguageSelect />
              {mounted && !loading && (
                <>
                  {!user ? (
                    <Link href="/signin" style={{ textDecoration: 'none' }}>
                      <OrganicButton variant="outline" style={{ padding: '9px 22px', fontSize: '14px' }}>
                        {t('signIn')}
                      </OrganicButton>
                    </Link>
                  ) : (
                    <Link href="/me" aria-label="My Profile" style={{ textDecoration: 'none' }}>
                      <HandDrawnAvatar
                        src={profile?.avatarUrl}
                        initials={profile?.initials || '··'}
                        size={36}
                        color={profile?.accentColor || 'var(--color-terracotta-light)'}
                        seed={Number(profile?.avatarSeed) || 77}
                      />
                    </Link>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <MobileNavModal open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
