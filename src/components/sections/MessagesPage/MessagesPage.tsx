'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { seedFromString } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useConversations } from '@/lib/data/hooks';
import { useEdgeFades } from '@/lib/hooks/useEdgeFades';
import type { Conversation, User } from '@/lib/db/types';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import { RowWash } from './RowWash';
import { ThreadView } from './ThreadView';
import styles from './MessagesPage.module.css';

export interface MessagesPageProps {
  /** The handle of the open thread's other participant, when one is open. */
  activeHandle?: string;
  /** A note being replied to (from the note notification's「回覆」exit). */
  replyNote?: { noteId: string; cardId: string };
}

/**
 * 私訊 — a Messenger-style two-pane surface: the people you're connected with
 * on the left (avatar, name, last-message time), the open thread on the right,
 * split 3:7 by a hand-drawn vertical rule that runs from the header to the
 * bottom of the viewport. The page title lives in the AppHeader brand slot, so
 * the panes get the full height. Phones show one pane at a time. The list's
 * bar is drawn and shows only while wanted (pointed at, scrolling); at rest its
 * edges fade where more is.
 */
export function MessagesPage({ activeHandle, replyNote }: MessagesPageProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data } = useConversations();
  const listRef = useRef<HTMLElement>(null);
  const listEdges = useEdgeFades(listRef);

  useEffect(() => {
    if (!loading && !user) router.push('/signin');
  }, [loading, user, router]);

  if (loading || !user) return null;

  const conversations = data?.conversations ?? [];
  const people = data?.people ?? {};
  const starters = data?.connectedWithoutConversation ?? [];
  const empty = data && conversations.length === 0 && starters.length === 0;

  const dayFmt = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const formatWhen = (d: Date) =>
    d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);

  const rowFor = (person: User, convo?: Conversation) => {
    const unread = convo ? (convo.unread[user.id] ?? 0) : 0;
    const preview = convo?.lastMessage
      ? (convo.lastMessage.senderId === user.id ? t('youPrefix') : '') + convo.lastMessage.text
      : t('noMessagesYet');
    return (
      <Link
        key={person.id}
        href={`/messages/${person.handle}`}
        className={styles.row}
        data-active={person.handle === activeHandle || undefined}
      >
        <RowWash seed={seedFromString(person.id)} />
        <HandDrawnAvatar
          src={person.avatarUrl}
          initials={person.initials}
          size={40}
          color={person.accentColor}
          seed={Number(person.avatarSeed) || 5}
        />
        <span className={styles.rowBody}>
          <span className={styles.rowHandle}>{person.handle}</span>
          <span className={styles.rowPreview}>{preview}</span>
        </span>
        <span className={styles.rowMeta}>
          {convo?.lastMessage && (
            <span className={styles.rowTime}>{formatWhen(convo.lastMessage.sentAt)}</span>
          )}
          {unread > 0 && <UnreadBadge count={unread} />}
        </span>
      </Link>
    );
  };

  return (
    <div className={styles.page} data-thread-open={activeHandle || undefined}>
      <div className={styles.listCol}>
        <aside ref={listEdges} className={`${styles.listPane} ${organicScrollTarget}`}>
          {/* Nothing at all yet: said here on a phone; beside a two-pane list (which stays empty), the
              detail pane says it. */}
          {empty && (
            <EmptyState
              className={styles.listEmpty}
              fills
              icon="chat"
              seed={23}
              title={t('emptyTitle')}
              line={t('empty')}
            />
          )}

          {conversations.map((c) => {
            const otherUid = c.participants.find((p) => p !== user.id) ?? '';
            const person = people[otherUid];
            return person ? rowFor(person, c) : null;
          })}

          {starters.length > 0 && (
            <>
              <p className={styles.startSectionTitle}>{t('startSection')}</p>
              {starters.map((person) => rowFor(person))}
            </>
          )}
        </aside>
        <OrganicScrollbar targetRef={listRef} seed={53} autoHide />
      </div>

      <div className={styles.vRule} aria-hidden>
        <Divider orientation="vertical" seed={71} amplitude={2} strokeWidth={INK} spacing={0} color="var(--split-pen)" />
      </div>

      <section className={styles.threadPane}>
        {activeHandle ? (
          <ThreadView key={activeHandle} handle={activeHandle} replyNote={replyNote} />
        ) : empty ? (
          <EmptyState fills icon="chat" seed={23} title={t('emptyTitle')} line={t('empty')} />
        ) : data ? (
          <EmptyState fills icon="chat" seed={23} line={t('pickOne')} />
        ) : null}
      </section>
    </div>
  );
}

/** Same wobbly badge chip as the header's NotificationBell. */
function UnreadBadge({ count }: { count: number }) {
  const h = 18;
  const w = count > 9 ? 26 : 19;
  return (
    <span
      style={{
        position: 'relative',
        width: w,
        height: h,
        color: 'var(--color-cream)',
        fontSize: 10,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={h * 0.4}
        seed={9}
        mag={1.3}
        segmentsH={1}
        segmentsV={1}
        curve={1.5}
        cornerJitter={3}
        cornerOffset={h * 0.06}
        fillColor="var(--color-terracotta)"
      />
      <span style={{ position: 'relative' }}>{count}</span>
    </span>
  );
}
