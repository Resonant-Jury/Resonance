'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Modal } from '@/components/molecules/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { Divider } from '@/components/atoms/Divider/Divider';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { NotificationConnectAction } from '@/components/molecules/ConnectInviteModal/NotificationConnectAction';
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

  // Wobbly badge chip — same hand-drawn curve language as the avatar frame.
  const badgeH = 18;
  const badgeW = unreadCount > 9 ? 26 : 19;

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
          // The badge hangs off the top-right corner; sit the bell a touch
          // lower so the pair reads vertically centered in the header row.
          transform: 'translateY(3px)',
        }}
      >
        <Icon name="bell" size={22} />
        {unreadCount > 0 && (
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
            <span style={{ position: 'relative' }}>{unreadCount}</span>
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
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {items.map((n, i) => {
            const isUnread = n.readAt === null;
            let body = '';
            let href: string | null = null;
            // Interaction notifications double as the connect entry point
            // (relationships grow from stories — see docs/TASKS.md): the
            // recipient may answer a resonance (later: a note) with a
            // connection invite right here.
            let connectFromUserId: string | null = null;
            if (n.type === 'invite') {
              body = tApp('invite', { handle: String(n.payload.fromHandle ?? '') });
              href = '/me';
            } else if (n.type === 'invite_accepted') {
              body = tApp('inviteAccepted', { handle: String(n.payload.fromHandle ?? '') });
            } else if (n.type === 'resonance_summary') {
              body = tApp('resonanceSummary', { count: Number(n.payload.count ?? 0) });
            } else if (n.type === 'translation_done') {
              body = tApp('translationDone');
              href = `/card/${n.payload.cardId}`;
            } else if (n.type === 'resonance') {
              body = tApp('resonance', { handle: String(n.payload.fromHandle ?? '') });
              href = `/card/${n.payload.cardId}`;
              connectFromUserId = n.payload.fromUserId ? String(n.payload.fromUserId) : null;
            } else if (n.type === 'card_link') {
              body = tApp('cardLink', { handle: String(n.payload.fromHandle ?? '') });
              href = `/card/${n.payload.cardId}`;
            } else if (n.type === 'invite_expired') {
              body = 'Invite expired';
            }
            const inner = (
              <div
                style={{
                  padding: '13px 2px',
                  fontSize: 14,
                  cursor: 'pointer',
                  color: isUnread ? 'var(--color-text)' : 'var(--color-text-muted)',
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
              <Fragment key={n.id}>
                {i > 0 && <Divider seed={29 + i * 7} spacing={0} />}
                <li>
                  <div onClick={() => handleClickItem(n)}>
                    {href ? (
                      <Link href={href as '/me' | `/card/${string}`} style={{ textDecoration: 'none' }}>
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </div>
                  {connectFromUserId && (
                    <div style={{ padding: '0 2px 13px' }}>
                      <NotificationConnectAction
                        fromUserId={connectFromUserId}
                        referenceCardId={
                          n.payload.cardId ? String(n.payload.cardId) : undefined
                        }
                      />
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
