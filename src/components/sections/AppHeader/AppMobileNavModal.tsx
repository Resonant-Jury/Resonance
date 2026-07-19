'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { wavyLine } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';

export interface AppMobileNavModalProps {
  open: boolean;
  onClose: () => void;
  /** Absent for a signed-out viewer — the identity block then becomes 登入. */
  user?: {
    initials: string;
    handle: string;
    accentColor: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };
  activeKey?: 'home' | 'me' | 'write';
}

const ITEMS: {
  key: 'home' | 'me' | 'write' | 'messages' | 'settings';
  href: '/home' | '/me' | '/write' | '/messages' | '/settings';
}[] = [
  { key: 'home', href: '/home' },
  { key: 'me', href: '/me' },
  { key: 'write', href: '/write' },
  { key: 'messages', href: '/messages' },
  { key: 'settings', href: '/settings' },
];

/** The rows a signed-out viewer can actually visit — just the 共振 Feed. */
const PUBLIC_KEYS: ReadonlySet<(typeof ITEMS)[number]['key']> = new Set(['home']);

export function AppMobileNavModal({ open, onClose, user, activeKey }: AppMobileNavModalProps) {
  const t = useTranslations('app.nav');
  const items = user ? ITEMS : ITEMS.filter(({ key }) => PUBLIC_KEYS.has(key));
  const dividerD = useMemo(() => wavyLine(260, 53, 1.3, 7), []);
  return (
    <Modal open={open} onClose={onClose} maxWidth={360} seed={53} padding="22px 24px 24px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <ResonanceIcon size={28} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20 }}>
          Resonance
        </span>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(({ key, href }) => (
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
                background: activeKey === key ? 'color-mix(in oklch, var(--color-terracotta-light) 45%, transparent)' : 'transparent',
              }}
            >
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>

      {/* Wavy SVG divider — matches the organic hand-drawn aesthetic. */}
      <svg
        viewBox="0 0 260 6"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          display: 'block',
          width: '100%',
          height: 6,
          margin: '20px 0 18px',
          overflow: 'visible',
        }}
      >
        <path
          d={dividerD}
          transform="translate(0,3)"
          stroke="oklch(55% 0.05 60 / 0.35)"
          strokeWidth={INK_LIGHT}
          fill="none"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The identity block doubles as the shortcut into the viewer's card
          box (their public profile lives one more tap away, on /me). A
          signed-out viewer gets 登入 in its place. */}
      <Link
        href={user ? '/me' : '/signin'}
        onClick={onClose}
        aria-label={user?.handle || undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          textDecoration: 'none',
        }}
      >
        {user ? (
          <HandDrawnAvatar
            src={user.avatarUrl}
            initials={user.initials}
            size={32}
            color={user.accentColor}
            seed={Number(user.avatarSeed) || 77}
          />
        ) : (
          <OrganicButton variant="outline" style={{ padding: '9px 22px', fontSize: 14 }}>
            {t('signIn')}
          </OrganicButton>
        )}
      </Link>
    </Modal>
  );
}
