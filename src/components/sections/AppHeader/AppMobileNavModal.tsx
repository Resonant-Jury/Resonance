'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Link } from '@/i18n/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';

export interface AppMobileNavModalProps {
  open: boolean;
  onClose: () => void;
  user: {
    initials: string;
    handle: string;
    accentColor: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };
  activeKey?: 'home' | 'me' | 'write';
}

const ITEMS: { key: 'home' | 'me' | 'write' | 'settings'; href: '/home' | '/me' | '/write' | '/settings' }[] = [
  { key: 'home', href: '/home' },
  { key: 'me', href: '/me' },
  { key: 'write', href: '/write' },
  { key: 'settings', href: '/settings' },
];

export function AppMobileNavModal({ open, onClose, user, activeKey }: AppMobileNavModalProps) {
  const t = useTranslations('app.nav');
  return (
    <Modal open={open} onClose={onClose} maxWidth={360} seed={53} padding="22px 24px 24px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <ResonanceIcon size={28} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20 }}>
          Resonance
        </span>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ITEMS.map(({ key, href }) => (
          <li key={key}>
            <Link
              href={href}
              onClick={onClose}
              style={{
                display: 'block',
                padding: '10px 12px',
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                color: activeKey === key ? 'var(--color-terracotta)' : 'var(--color-text)',
                textDecoration: 'none',
                borderRadius: 10,
                background: activeKey === key ? 'oklch(92% 0.06 55 / 0.45)' : 'transparent',
              }}
            >
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid oklch(80% 0.02 75)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <HandDrawnAvatar
          src={user.avatarUrl}
          initials={user.initials}
          size={32}
          color={user.accentColor}
          seed={Number(user.avatarSeed) || 77}
        />
        <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{user.handle}</span>
      </div>
    </Modal>
  );
}
