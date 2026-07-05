'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { Textarea } from '@/components/atoms/Field/Field';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile, useThread } from '@/lib/data/hooks';
import { getUserByHandle, isConnected } from '@/lib/db/firestore/client/reads';
import {
  MESSAGE_MAX_LENGTH,
  conversationId,
  getConversation,
  markConversationRead,
  notifyConversationStarted,
  openConversation,
  sendMessage,
} from '@/lib/db/firestore/client/messages';
import { MessageBubble } from './MessageBubble';
import styles from './MessagesPage.module.css';

export interface ThreadViewProps {
  handle: string;
}

/**
 * One open conversation. The conversation doc is created lazily on the first
 * send (not on page open), so browsing to a connected person's thread never
 * litters either list with empty conversations. Messages stream in realtime
 * via {@link useThread} once the doc exists.
 */
export function ThreadView({ handle }: ThreadViewProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const { mutate: globalMutate } = useSWRConfig();

  const { data: other, isLoading: loadingOther } = useSWR(
    `user:handle:${handle}`,
    () => getUserByHandle(handle),
  );
  const pairId = user && other ? conversationId(user.id, other.id) : undefined;
  const { data: convo, mutate: mutateConvo } = useSWR(
    pairId ? `conversation:${pairId}` : null,
    () => getConversation(pairId!),
  );
  const { data: connected } = useSWR(
    user && other && user.id !== other.id ? `connected:${pairId}` : null,
    () => isConnected(user!.id, other!.id),
  );

  // Subscribe only once the conversation doc exists — the messages read rule
  // get()s the parent doc, so listening earlier would just error.
  const thread = useThread(convo ? pairId : undefined);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Entering (or receiving into) a thread clears the viewer's unread counter.
  // The `convo` snapshot goes stale while the realtime thread is open (SWR
  // doesn't know the other side wrote), so a fresh incoming message — the last
  // one isn't ours — also triggers the reset (writing 0 is idempotent).
  useEffect(() => {
    if (!convo || !user || !pairId) return;
    const last = thread.messages[thread.messages.length - 1];
    const incoming = !!last && last.senderId !== user.id;
    if (incoming || (convo.unread[user.id] ?? 0) > 0) {
      void markConversationRead(pairId).then(() => {
        void mutateConvo();
        void globalMutate(`conversations:${user.id}`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo, user?.id, pairId, thread.messages.length]);

  // Keep the newest message in view.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  const trimmed = text.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MESSAGE_MAX_LENGTH && !!pairId;

  function send() {
    if (!valid || pending || !other || !pairId) return;
    setError(null);
    start(async () => {
      try {
        // The very first message rings the recipient's bell once; after that
        // only the unread badge speaks (no per-message pings).
        const isFirst = !convo?.lastMessage;
        // Idempotent: creates the doc on the first message, no-ops after.
        await openConversation(other.id);
        await sendMessage(pairId, trimmed);
        if (isFirst && me) void notifyConversationStarted(other.id, me.handle);
        setText('');
        if (!convo) await mutateConvo();
        if (user) void globalMutate(`conversations:${user.id}`);
      } catch {
        setError(t('sendError'));
      }
    });
  }

  if (loadingOther) return null;
  if (!other || (user && other.id === user.id)) {
    return <p className={styles.quietNote}>{t('userNotFound')}</p>;
  }

  const profileHref = `/u/${other.handle}` as const;
  const dayFmt = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' });
  const fullFmt = new Intl.DateTimeFormat(locale, {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      <Link href="/messages" className={styles.backLink}>
        <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
          <Icon name="arrow-right" size={14} />
        </span>
        {t('back')}
      </Link>

      <div className={styles.threadHeader}>
        <Link href={profileHref} style={{ textDecoration: 'none' }} title={t('viewProfile')}>
          <HandDrawnAvatar
            src={other.avatarUrl}
            initials={other.initials}
            size={38}
            color={other.accentColor}
            seed={Number(other.avatarSeed) || 3}
          />
        </Link>
        <Link href={profileHref} className={styles.threadHandle}>
          {other.handle}
        </Link>
      </div>
      <Divider seed={41} spacing={0} />

      {connected === false ? (
        <div style={{ padding: '20px 2px' }}>
          <p className={styles.quietNote}>{t('notConnected')}</p>
          <Link
            href={profileHref}
            style={{ fontSize: 13, color: 'var(--color-terracotta)', textUnderlineOffset: 3 }}
          >
            {t('viewProfile')}
          </Link>
        </div>
      ) : (
        <>
          <div ref={scrollerRef} className={styles.scroller}>
            {thread.ready && thread.messages.length === 0 && (
              <p className={styles.quietNote}>{t('noMessagesYet')}</p>
            )}
            {convo === null && !thread.ready && (
              <p className={styles.quietNote}>{t('noMessagesYet')}</p>
            )}
            {thread.messages.map((m, i) => {
              const prev = thread.messages[i - 1];
              const newDay = !prev || prev.sentAt.toDateString() !== m.sentAt.toDateString();
              return (
                <div key={m.id} style={{ display: 'contents' }}>
                  {newDay && <span className={styles.dayLabel}>{dayFmt.format(m.sentAt)}</span>}
                  <div className={styles.bubbleRow} data-own={m.senderId === user?.id || undefined}>
                    <MessageBubble
                      id={m.id}
                      text={m.text}
                      own={m.senderId === user?.id}
                      title={fullFmt.format(m.sentAt)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.composer}>
            <div className={styles.composerField}>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={t('placeholder')}
                aria-label={t('threadWith', { handle: other.handle })}
                rows={2}
                maxLength={MESSAGE_MAX_LENGTH}
              />
            </div>
            <div style={{ opacity: valid && !pending ? 1 : 0.5, pointerEvents: valid && !pending ? 'auto' : 'none' }}>
              <OrganicButton variant="primary" size="sm" onClick={send}>
                {pending ? '…' : t('send')}
              </OrganicButton>
            </div>
          </div>
          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-terracotta)', margin: '6px 0 0' }}>{error}</p>
          )}
        </>
      )}
    </>
  );
}
