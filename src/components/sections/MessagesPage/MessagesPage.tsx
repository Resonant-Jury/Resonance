'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { seedFromString } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useConversations } from '@/lib/data/hooks';
import type { Conversation, User } from '@/lib/db/types';
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
 * the panes get the full height. Phones show one pane at a time.
 */
export function MessagesPage({ activeHandle, replyNote }: MessagesPageProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data } = useConversations();

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
      <aside className={styles.listPane}>
        {empty && <p className={styles.emptyText}>{t('empty')}</p>}

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

      <div className={styles.vRule} aria-hidden>
        <Divider orientation="vertical" seed={71} amplitude={2} strokeWidth={INK} spacing={0} />
      </div>

      <section className={styles.threadPane}>
        {activeHandle ? (
          <ThreadView key={activeHandle} handle={activeHandle} replyNote={replyNote} />
        ) : (
          <p className={styles.quietNote} style={{ paddingTop: 26 }}>
            {t('pickOne')}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The row's hover/selected wash — a wobbly curved fill (the markdown toolbar's
 * hand-drawn chip language) driven by the row's `--row-fill` variable, instead
 * of a flat rounded rectangle or a border.
 */
function RowWash({ seed }: { seed: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref);
  return (
    <span ref={ref} className={styles.rowWash} aria-hidden>
      {w > 0 && h > 0 && (
        <HandDrawnBorder
          w={w}
          h={h}
          R={h * 0.28}
          seed={seed}
          mag={2.4}
          segmentsH={3}
          segmentsV={1}
          curve={1.3}
          cornerJitter={2.4}
          cornerOffset={h * 0.05}
          fillColor="var(--row-fill)"
        />
      )}
    </span>
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
