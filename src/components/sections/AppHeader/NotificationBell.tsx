'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import type { Notification } from '@/lib/db/types';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  listNotifications,
  markNotificationRead,
} from '@/lib/db/firestore/client/notifications';

export function NotificationBell() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [fetched, setFetched] = useState(false);

  const tApp = useTranslations('app.notifications');
  const tNav = useTranslations('app.nav');

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setFetched(true);
      return;
    }
    try {
      const next = await listNotifications(20);
      setItems(next);
    } catch {
      // rules / network errors — keep current state
    } finally {
      setFetched(true);
    }
  }, [user]);

  // Load count on mount (and whenever auth changes) so the badge reflects
  // unread state without opening the bell.
  useEffect(() => {
    if (loading) return;
    void refresh();
  }, [loading, refresh]);

  const unreadCount = useMemo(
    () => items.filter((n) => n.readAt === null).length,
    [items],
  );

  function handleClickItem(n: Notification) {
    if (n.readAt === null) {
      setItems((prev) =>
        prev.map((it) => (it.id === n.id ? { ...it, readAt: new Date() } : it)),
      );
      markNotificationRead(n.id).catch(() => {});
    }
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (!fetched) void refresh();
        }}
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
        <Icon name="bell" size={22} />
        {unreadCount > 0 && (
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
            {unreadCount}
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
          {tNav('notifications')}
        </h3>
        {fetched && items.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{tApp('empty')}</p>
        )}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((n) => {
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
