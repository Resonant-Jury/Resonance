'use client';

import { useEffect, useMemo, useState } from 'react';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { HamburgerIcon } from '@/components/atoms/HamburgerIcon/HamburgerIcon';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { Link } from '@/i18n/navigation';
import { NotificationBell } from './NotificationBell';
import { MessagesEntry } from './MessagesEntry';
import { AppMobileNavModal } from './AppMobileNavModal';
import { Subnavbar } from './Subnavbar';
import styles from './AppHeader.module.css';

const HEADER_BODY_H = 68;
const HEADER_WAVE_H = 14;
const HEADER_TOTAL_H = HEADER_BODY_H + HEADER_WAVE_H;

function buildHeaderPaths(seed: number) {
  const W = 1440;
  const baseY = HEADER_BODY_H + HEADER_WAVE_H * 0.35;
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
  activeKey?: 'home' | 'me' | 'write';
}

export function AppHeader({ user, activeKey }: AppHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile(720);

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


  return (
    <header className={styles.header} style={{ height: HEADER_TOTAL_H }}>
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

      <div className={styles.row} style={{ height: HEADER_BODY_H }}>
        <Link href="/home" className={styles.logo}>
          <ResonanceIcon size={38} />
          <span className={styles.brand}>Resonance</span>
        </Link>

        {isMobile ? (
          <div className={styles.account}>
            <MessagesEntry />
            <NotificationBell />
            <button
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className={styles.menuBtn}
            >
              <HamburgerIcon size={26} />
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

      <AppMobileNavModal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        activeKey={activeKey}
      />
    </header>
  );
}

export { HEADER_TOTAL_H };
