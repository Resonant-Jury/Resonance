'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import {
  acceptInvite,
  listIncomingPendingInvites,
  withdrawInvite,
} from '@/lib/db/firestore/client/invites';
import type { Invite } from '@/lib/db/types';

export function InvitesInbox() {
  const t = useTranslations('inviteInbox');
  const [items, setItems] = useState<Invite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const next = await listIncomingPendingInvites();
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function accept(invite: Invite) {
    setPendingId(invite.id);
    setError(null);
    start(async () => {
      try {
        await acceptInvite(invite.id);
        setItems((prev) => prev.filter((i) => i.id !== invite.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingId(null);
      }
    });
  }

  function decline(invite: Invite) {
    setPendingId(invite.id);
    setError(null);
    start(async () => {
      try {
        await withdrawInvite(invite.id);
        setItems((prev) => prev.filter((i) => i.id !== invite.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingId(null);
      }
    });
  }

  if (!loaded) return null;
  if (items.length === 0) return null;

  return (
    <section
      style={{
        marginBottom: 32,
        padding: '20px 22px',
        borderRadius: 18,
        background: 'oklch(95% 0.04 75 / 0.6)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 12,
          color: 'var(--color-text)',
        }}
      >
        {t('title', { count: items.length })}
      </h2>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((invite) => (
          <li
            key={invite.id}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'oklch(98% 0.01 75)',
              border: '1px solid oklch(86% 0.02 75)',
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: 'var(--color-text)',
                marginBottom: 10,
                whiteSpace: 'pre-wrap',
              }}
            >
              {invite.message || t('emptyMessage')}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <OrganicButton
                variant="primary"
                onClick={() => accept(invite)}
              >
                {pendingId === invite.id ? '…' : t('accept')}
              </OrganicButton>
              <OrganicButton
                variant="ghost"
                onClick={() => decline(invite)}
              >
                {pendingId === invite.id ? '…' : t('decline')}
              </OrganicButton>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {t('expiresAt', {
                  date: invite.expiresAt.toLocaleDateString(),
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--color-terracotta)' }}>{error}</p>
      )}
    </section>
  );
}
