'use client';

import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

export function FloatingWriteButton() {
  const isMobile = useIsMobile(720);
  if (!isMobile) return null;
  return (
    <Link
      href="/write"
      aria-label="Write a card"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 88,
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
      <Icon name="plus" size={26} strokeWidth={2.4} ariaLabel="Write a card" />
    </Link>
  );
}
