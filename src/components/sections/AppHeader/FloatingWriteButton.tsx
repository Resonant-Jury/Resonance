'use client';

import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

/**
 * The primary "write a card" affordance, anchored bottom-right on every
 * viewport (it replaced the old header button and now sits where the runtime
 * tweak toggle used to live). Keeps the organic rounded-square FAB look; uses
 * the hand-drawn pen icon.
 */
export function FloatingWriteButton() {
  const isMobile = useIsMobile(720);
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
        borderRadius: '20px 24px 18px 22px',
        background: 'var(--color-terracotta)',
        color: 'var(--color-cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
        boxShadow: '0 6px 22px oklch(20% 0.04 60 / 0.25)',
        zIndex: 90,
      }}
    >
      <Icon name="pen" size={24} strokeWidth={2.2} ariaLabel="Write a card" />
    </Link>
  );
}
