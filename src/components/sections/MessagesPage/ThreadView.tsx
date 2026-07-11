'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { Textarea } from '@/components/atoms/Field/Field';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Divider } from '@/components/atoms/Divider/Divider';
import { InsertCardModal } from '@/components/molecules/MarkdownEditor/InsertCardModal';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { INK } from '@/lib/design/strokes';
import { seedFromString } from '@/lib/design/prng';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile, useThread } from '@/lib/data/hooks';
import { getUserByHandle, isConnected } from '@/lib/db/firestore/client/reads';
import {
  MESSAGE_MAX_LENGTH,
  conversationId,
  deleteConversation,
  getConversation,
  markConversationRead,
  notifyConversationStarted,
  openConversation,
  sendMessage,
} from '@/lib/db/firestore/client/messages';
import type { Card } from '@/lib/db/types';
import { MessageBubble } from './MessageBubble';
import { MessageCardRef } from './MessageCardRef';
import styles from './MessagesPage.module.css';

export interface ThreadViewProps {
  handle: string;
  /** A note being replied to — the first message quotes it as a reply. */
  replyNote?: { noteId: string; cardId: string };
}

/**
 * One open conversation. The conversation doc is created lazily on the first
 * send (not on page open), so browsing to a connected person's thread never
 * litters either list with empty conversations. Messages stream in realtime
 * via {@link useThread} once the doc exists.
 */
export function ThreadView({ handle, replyNote }: ThreadViewProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
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
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  // Header「⋯」menu surfaces: in-thread search, the shared cards/links list,
  // and delete-with-confirm.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The note-reply quote rides the next message; dismissable if reconsidered.
  const [noteRef, setNoteRef] = useState(replyNote);
  useEffect(() => setNoteRef(replyNote), [replyNote?.noteId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-grow: the input rests at one line and takes its height from the
  // content (the CSS max-height caps it, after which it scrolls).
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const trimmed = text.trim();
  const hasBody = trimmed.length > 0 || !!pendingCard;
  const valid = hasBody && trimmed.length <= MESSAGE_MAX_LENGTH && !!pairId;

  function send() {
    if (!valid || pending || !other || !pairId) return;
    setError(null);
    const card = pendingCard;
    const quotedNote = noteRef;
    start(async () => {
      try {
        // The very first message rings the recipient's bell once; after that
        // only the unread badge speaks (no per-message pings).
        const isFirst = !convo?.lastMessage;
        // Idempotent: creates the doc on the first message, no-ops after.
        await openConversation(other.id);
        await sendMessage(pairId, trimmed, {
          cardRef: card?.id,
          noteRef: quotedNote,
          // A bodyless card share borrows the card title for the list preview.
          previewFallback: card?.thoughtCore,
        });
        if (isFirst && me) void notifyConversationStarted(other.id, me.handle);
        setText('');
        setPendingCard(null);
        setNoteRef(undefined);
        if (!convo) await mutateConvo();
        if (user) void globalMutate(`conversations:${user.id}`);
      } catch {
        setError(t('sendError'));
      }
    });
  }

  function confirmDelete() {
    if (deleting || !pairId || !user) return;
    setDeleting(true);
    void deleteConversation(pairId)
      .then(() => {
        void globalMutate(`conversations:${user.id}`);
        void globalMutate(`conversation:${pairId}`, null, { revalidate: false });
        router.push('/messages');
      })
      .catch(() => {
        setError(t('deleteError'));
        setDeleting(false);
        setConfirmingDelete(false);
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

  // In-thread search narrows the scroller to matching messages (a card-only
  // message matches on nothing and hides while a query is active).
  const query = searchOpen ? searchQuery.trim().toLowerCase() : '';
  const visibleMessages = query
    ? thread.messages.filter((m) => m.text.toLowerCase().includes(query))
    : thread.messages;

  // Everything shareable in this thread: card embeds and links found in text.
  const sharedCardIds = [...new Set(thread.messages.flatMap((m) => (m.cardRef ? [m.cardRef] : [])))];
  const sharedLinks = [
    ...new Set(thread.messages.flatMap((m) => m.text.match(/https?:\/\/[^\s)]+/g) ?? [])),
  ];

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
        <span className={styles.threadHeaderSpacer} />
        {convo && (
          <OrganicMenu
            label={t('moreMenu')}
            seed={seedFromString(convo.id)}
            triggerSize={34}
            busy={deleting}
            items={[
              { key: 'search', icon: 'search', label: t('menuSearch') },
              { key: 'media', icon: 'cards', label: t('menuMedia') },
              { key: 'delete', icon: 'trash', label: t('menuDelete'), danger: true },
            ]}
            onChoose={(key) => {
              if (key === 'search') setSearchOpen(true);
              else if (key === 'media') setMediaOpen(true);
              else if (key === 'delete') setConfirmingDelete(true);
            }}
          />
        )}
      </div>
      <div className={styles.threadDivider}>
        <Divider seed={41} spacing={0} strokeWidth={INK} />
      </div>

      {searchOpen && (
        <div className={styles.searchBar}>
          <Icon name="search" size={16} />
          <input
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('menuSearch')}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
              }
            }}
          />
          {query && (
            <span className={styles.searchCount}>
              {t('searchCount', { count: visibleMessages.length })}
            </span>
          )}
          <button
            type="button"
            className={styles.attachRemove}
            aria-label={t('searchClose')}
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

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
            {query && visibleMessages.length === 0 && (
              <p className={styles.quietNote}>{t('searchCount', { count: 0 })}</p>
            )}
            {visibleMessages.map((m, i) => {
              const prev = visibleMessages[i - 1];
              const newDay = !prev || prev.sentAt.toDateString() !== m.sentAt.toDateString();
              const own = m.senderId === user?.id;
              return (
                <div key={m.id} style={{ display: 'contents' }}>
                  {newDay && <span className={styles.dayLabel}>{dayFmt.format(m.sentAt)}</span>}
                  <div className={styles.bubbleRow} data-own={own || undefined}>
                    <div className={styles.messageStack} data-own={own || undefined}>
                      {m.cardRef && <MessageCardRef cardId={m.cardRef} />}
                      {(m.text || m.noteRef) && (
                        <MessageBubble
                          id={m.id}
                          text={m.text}
                          own={own}
                          title={fullFmt.format(m.sentAt)}
                          quoteLabel={m.noteRef ? t('quotedNote') : undefined}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending attachments ride the next message. */}
          {(noteRef || pendingCard) && (
            <div className={styles.attachments}>
              {noteRef && (
                <span className={styles.attachChip}>
                  <Icon name="note" size={14} />
                  {t('quotedNote')}
                  <button
                    type="button"
                    aria-label={t('removeCard')}
                    className={styles.attachRemove}
                    onClick={() => setNoteRef(undefined)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              )}
              {pendingCard && (
                <span className={styles.attachChip}>
                  <Icon name="cards" size={14} />
                  <span className={styles.attachCardTitle}>{pendingCard.thoughtCore}</span>
                  <button
                    type="button"
                    aria-label={t('removeCard')}
                    className={styles.attachRemove}
                    onClick={() => setPendingCard(null)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              )}
            </div>
          )}

          <div className={styles.composer}>
            <button
              type="button"
              className={styles.attachBtn}
              aria-label={t('attachCard')}
              title={t('attachCard')}
              onClick={() => setCardModalOpen(true)}
            >
              <Icon name="cards" size={18} />
            </button>
            <div className={styles.composerField}>
              <Textarea
                ref={inputRef}
                className={styles.composerInput}
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
                rows={1}
                maxLength={MESSAGE_MAX_LENGTH}
              />
            </div>
            <div
              className={styles.sendWrap}
              style={{ opacity: valid && !pending ? 1 : 0.5, pointerEvents: valid && !pending ? 'auto' : 'none' }}
            >
              <OrganicButton variant="primary" size="sm" onClick={send} style={{ height: '100%' }}>
                {pending ? '…' : t('send')}
              </OrganicButton>
            </div>
          </div>
          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-terracotta)', margin: '6px 0 0' }}>{error}</p>
          )}

          <InsertCardModal
            open={cardModalOpen}
            onClose={() => setCardModalOpen(false)}
            title={t('pickCard')}
            subtitle={t('pickCardSubtitle')}
            onPick={(card) => {
              setPendingCard(card);
              setCardModalOpen(false);
            }}
          />

          {/* Everything shared in this thread: card embeds and plain links. */}
          <Modal
            open={mediaOpen}
            onClose={() => setMediaOpen(false)}
            seed={53}
            maxWidth={480}
            ariaLabel={t('mediaTitle')}
          >
            <h3 className={styles.mediaTitle}>{t('mediaTitle')}</h3>
            <p className={styles.mediaSubtitle}>{t('mediaSubtitle')}</p>
            {sharedCardIds.length === 0 && sharedLinks.length === 0 ? (
              <p className={styles.quietNote}>{t('mediaEmpty')}</p>
            ) : (
              <div className={styles.mediaBody}>
                {sharedCardIds.length > 0 && (
                  <section>
                    <h4 className={styles.mediaSection}>{t('mediaCards')}</h4>
                    <div className={styles.mediaCards}>
                      {sharedCardIds.map((id) => (
                        <MessageCardRef key={id} cardId={id} />
                      ))}
                    </div>
                  </section>
                )}
                {sharedLinks.length > 0 && (
                  <section>
                    <h4 className={styles.mediaSection}>{t('mediaLinks')}</h4>
                    <ul className={styles.mediaLinkList}>
                      {sharedLinks.map((url) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </Modal>

          <Modal
            open={confirmingDelete}
            onClose={() => (deleting ? undefined : setConfirmingDelete(false))}
            seed={59}
            maxWidth={400}
            ariaLabel={t('deleteConfirmTitle')}
          >
            <h3 className={styles.mediaTitle}>{t('deleteConfirmTitle')}</h3>
            <p className={styles.mediaSubtitle}>{t('deleteConfirmBody')}</p>
            <div
              className={styles.confirmActions}
              style={deleting ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
            >
              <OrganicButton variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                {t('deleteCancel')}
              </OrganicButton>
              <OrganicButton variant="primary" size="sm" onClick={confirmDelete}>
                {deleting ? '…' : t('deleteConfirm')}
              </OrganicButton>
            </div>
          </Modal>
        </>
      )}
    </>
  );
}
