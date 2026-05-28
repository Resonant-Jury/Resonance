'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Modal } from '@/components/molecules/Modal/Modal';
import type { Notification } from '@/lib/db/types';
import { markNotificationRead } from '@/lib/db/firestore/client/notifications';

export interface NotificationBellProps {
  count: number;
  notifications?: Notification[];
}

export function NotificationBell({ count, notifications = [] }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [localCount, setLocalCount] = useState(count);
  const [list, setList] = useState(notifications);
  const mountRef = useRef(true);

  useEffect(() => {
    setLocalCount(count);
  }, [count]);
  useEffect(() => {
    setList(notifications);
  }, [notifications]);
  useEffect(() => () => { mountRef.current = false; }, []);

  const tApp = useTranslations('app.notifications');

  function handleClickItem(n: Notification) {
    if (n.readAt === null) {
      setLocalCount((c) => Math.max(0, c - 1));
      setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date() } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          color: 'var(--color-text)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5.5 16.5 C 6 12.5, 6 10, 7 8 C 8.5 5, 10.5 4, 12 4 C 14 4, 16 5, 17.2 8 C 18 10, 18.2 12.5, 18.8 16.5 C 17 17, 14 17.4, 12 17.4 C 10 17.4, 7 17, 5.5 16.5 Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M10.3 19.4 C 10.8 20.4, 13.3 20.4, 13.8 19.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        {localCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--color-terracotta)',
              color: 'var(--color-cream)',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {localCount}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        maxWidth={400}
        seed={29}
        padding="24px 22px 22px"
        ariaLabel="Notifications"
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, marginBottom: 14 }}>
          {useTranslations('app.nav')('notifications')}
        </h3>
        {list.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{tApp('empty')}</p>
        )}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((n) => {
            const isUnread = n.readAt === null;
            let body = '';
            let href: string | null = null;
            if (n.type === 'invite') {
              body = tApp('invite', { handle: String(n.payload.fromHandle ?? '') });
              href = '/me';
            } else if (n.type === 'resonance_summary') {
              body = tApp('resonanceSummary', { count: Number(n.payload.count ?? 0) });
            } else if (n.type === 'translation_done') {
              body = tApp('translationDone');
              href = `/card/${n.payload.cardId}`;
            } else if (n.type === 'invite_expired') {
              body = 'Invite expired';
            }
            const inner = (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: isUnread ? 'oklch(92% 0.05 55 / 0.35)' : 'transparent',
                  fontSize: 14,
                  cursor: 'pointer',
                  color: 'var(--color-text)',
                }}
              >
                {body}
                {isUnread && (
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--color-terracotta)',
                      marginLeft: 8,
                      verticalAlign: 'middle',
                    }}
                  />
                )}
              </div>
            );
            return (
              <li key={n.id} onClick={() => handleClickItem(n)}>
                {href ? (
                  <Link href={href as '/me' | `/card/${string}`} style={{ textDecoration: 'none' }}>
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
