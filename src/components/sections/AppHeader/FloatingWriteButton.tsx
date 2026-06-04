'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { INK } from '@/lib/design/strokes';

/**
 * The primary "write a card" affordance, anchored bottom-right on every
 * viewport (it replaced the old header button and now sits where the runtime
 * tweak toggle used to live). Keeps the organic rounded-square FAB look; uses
 * the hand-drawn pen icon.
 */
export function FloatingWriteButton() {
  const pathname = usePathname();
  const isMobile = useIsMobile(720);

  // Do not show the floating write button on the write/edit page itself.
  if (pathname === '/write' || pathname.startsWith('/write/')) {
    return null;
  }

  return (
    <Link
      href="/write"
      aria-label="Write a card"
      style={{
        position: 'fixed',
        right: isMobile ? 20 : 24,
        bottom: isMobile ? 88 : 24,
        width: 56,
        height: 56,
        color: 'var(--color-cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
        zIndex: 90,
      }}
    >
      <HandDrawnBorder
        w={56}
        h={56}
        R={56 * 0.4}
        seed={3}
        mag={56 * 0.022}
        fillColor="var(--color-terracotta)"
        strokeColor="color-mix(in oklch, var(--color-terracotta), black 35%)"
        strokeWidth={INK}
        segmentsH={1}
        segmentsV={1}
        curve={1.3}
        cornerJitter={3.2}
        cornerOffset={56 * 0.06}
      />
      <span style={{ position: 'relative', zIndex: 1, display: 'flex' }}>
        <Icon name="pen" size={24} strokeWidth={2.2} ariaLabel="Write a card" />
      </span>
    </Link>
  );
}

