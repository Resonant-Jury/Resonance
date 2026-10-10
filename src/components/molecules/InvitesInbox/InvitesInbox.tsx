'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { ApiError } from '@/lib/db/firestore/client/api';
import {
  acceptInvite,
  declineInvite,
  listIncomingPendingInvites,
} from '@/lib/db/firestore/client/invites';
import type { Invite } from '@/lib/db/types';

/** The server's "no longer open" (declined, withdrawn, or past its date): the invite is gone for good. */
const isClosed = (err: unknown) => err instanceof ApiError && err.status === 409;

export function InvitesInbox() {
  const t = useTranslations('inviteInbox');
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<Invite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Which of the two was pressed: it shows the loader, the other rests.
  const [pendingVerb, setPendingVerb] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const next = await listIncomingPendingInvites();
      setItems(next);
    } catch {
      setError(t('error'));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  // Once Firebase Auth has restored the viewer (on a fresh load it hasn't yet
  // at mount, and the query would find no one's invites).
  useEffect(() => {
    if (uid) void refresh();
  }, [refresh, uid]);

  function accept(invite: Invite) {
    setPendingId(invite.id);
    setPendingVerb('accept');
    setError(null);
    start(async () => {
      try {
        await acceptInvite(invite.id);
        setItems((prev) => prev.filter((i) => i.id !== invite.id));
      } catch (err) {
        // Closed since the list was read (its date passed, or it was withdrawn): it goes, and says why.
        if (isClosed(err)) setItems((prev) => prev.filter((i) => i.id !== invite.id));
        setError(t(isClosed(err) ? 'closed' : 'error'));
      } finally {
        setPendingId(null);
      }
    });
  }

  function decline(invite: Invite) {
    setPendingId(invite.id);
    setPendingVerb('decline');
    setError(null);
    start(async () => {
      try {
        await declineInvite(invite.id);
        setItems((prev) => prev.filter((i) => i.id !== invite.id));
      } catch {
        setError(t('error'));
      } finally {
        setPendingId(null);
      }
    });
  }

  if (!loaded) return null;
  // The last invite gone as closed still says why, until the next visit.
  if (items.length === 0 && !error) return null;

  return (
    <section
      style={{
        marginBottom: 32,
        padding: '20px 22px',
        borderRadius: 18,
        background: 'oklch(95% 0.04 75 / 0.6)',
      }}
    >
      {items.length > 0 && (
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
      )}
      {items.length > 0 && (
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
                  variant="solid"
                  onClick={() => accept(invite)}
                  loading={pendingId === invite.id && pendingVerb === 'accept'}
                  disabled={pendingId === invite.id && pendingVerb === 'decline'}
                >
                  {t('accept')}
                </OrganicButton>
                <OrganicButton
                  variant="text"
                  onClick={() => decline(invite)}
                  loading={pendingId === invite.id && pendingVerb === 'decline'}
                  disabled={pendingId === invite.id && pendingVerb === 'accept'}
                >
                  {t('decline')}
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
      )}
      {error && (
        <p role="status" style={{ marginTop: items.length > 0 ? 10 : 0, fontSize: 12, color: 'var(--color-terracotta)' }}>{error}</p>
      )}
    </section>
  );
}
