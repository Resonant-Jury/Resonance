'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useConversations } from '@/lib/data/hooks';

/**
 * Header entry to 私訊: the chat icon beside the notification bell, wearing
 * the same wobbly unread badge. Unread counts ride the polled conversations
 * hook — the bell stays about events, this badge is about waiting words.
 */
export function MessagesEntry() {
  const t = useTranslations('app.nav');
  const { data } = useConversations();
  const unread = data?.unreadTotal ?? 0;

  const badgeH = 18;
  const badgeW = unread > 9 ? 26 : 19;

  return (
    <Link
      href="/messages"
      aria-label={t('messages')}
      title={t('messages')}
      style={{
        position: 'relative',
        display: 'inline-flex',
        padding: 6,
        color: 'var(--color-text)',
        textDecoration: 'none',
        // Match the bell's optical centering (its badge hangs off the top).
        transform: 'translateY(3px)',
      }}
    >
      <Icon name="chat" size={22} />
      {unread > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -3,
            width: badgeW,
            height: badgeH,
            color: 'var(--color-cream)',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          <HandDrawnBorder
            w={badgeW}
            h={badgeH}
            R={badgeH * 0.4}
            seed={9}
            mag={1.3}
            segmentsH={1}
            segmentsV={1}
            curve={1.5}
            cornerJitter={3}
            cornerOffset={badgeH * 0.06}
            fillColor="var(--color-terracotta)"
          />
          <span style={{ position: 'relative' }}>{unread}</span>
        </span>
      )}
    </Link>
  );
}
