'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { Textarea } from '@/components/atoms/Field/Field';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { OrganicScrollbar } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { CardEmbedSourceContext, useCardEmbed } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { useSafetyActions } from '@/components/molecules/SafetyActions/useSafetyActions';
import { INK } from '@/lib/design/strokes';
import { seedFromString } from '@/lib/design/prng';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCardSummaries, useMyBlockedIds } from '@/lib/data/hooks';
import { useChatThread } from '@/lib/data/thread';
import { threadCardKeys } from '@/lib/chat/cardLink';
import { threadRows } from '@/lib/chat/rows';
import type { ChatMessage } from '@/lib/chat/message';
import { getUserByHandle, isConnected } from '@/lib/db/firestore/client/reads';
import {
  MESSAGE_MAX_LENGTH,
  conversationId,
  deleteConversation,
  getConversation,
  markConversationRead,
} from '@/lib/db/firestore/client/messages';
import type { Card } from '@/lib/db/types';
import { MessageBubble } from './MessageBubble';
import { MessageCardRef } from './MessageCardRef';
import { LinkPreviewCard } from './LinkPreviewCard';
import { ReplyQuote } from './ReplyQuote';
import { linkify } from '@/lib/links/linkify';
import styles from './MessagesPage.module.css';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';
import { centerRow, useThreadScroll } from './useThreadScroll';

// The card picker loads when it is first opened, not with the thread.
const InsertCardModal = dynamic(() =>
  import('@/components/molecules/MarkdownEditor/InsertCardModal').then((m) => m.InsertCardModal),
);

export interface ThreadViewProps {
  handle: string;
  /** A note being replied to — the first message quotes it as a reply. */
  replyNote?: { noteId: string; cardId: string };
}

/**
 * One open conversation. The conversation doc is created lazily on the first
 * send (not on page open), so browsing to a connected person's thread never
 * litters either list with empty conversations. Its messages — the newest
 * live once the doc exists, older ones paged in as the reader scrolls up or
 * searches, and the viewer's own still on their way — come from
 * {@link useChatThread}.
 */
export function ThreadView({ handle, replyNote }: ThreadViewProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();

  const { data: other, isLoading: loadingOther } = useSWR(
    `user:handle:${handle}`,
    () => getUserByHandle(handle),
  );
  const pairId = user && other ? conversationId(user.id, other.id) : undefined;
  const { data: convo, mutate: mutateConvo } = useSWR(
    pairId ? `conversation:${pairId}` : null,
    () => getConversation(pairId!),
    { revalidateOnFocus: true },
  );
  const { data: connected } = useSWR(
    user && other && user.id !== other.id ? `connected:${pairId}` : null,
    () => isConnected(user!.id, other!.id),
  );

  // Report / block the other participant from the header「⋯」menu. Blocking
  // ends the connection, so the thread freezes (see firestore.rules).
  const { data: blocked } = useMyBlockedIds();
  const safety = useSafetyActions({
    report: {
      type: 'message',
      id: pairId ?? '',
      userId: other?.id ?? '',
      handle: other?.handle,
      contextId: pairId,
    },
    isBlocked: !!other && !!blocked?.has(other.id),
    onBlockedChange: () => {
      void globalMutate(`connected:${pairId}`);
      if (user) void globalMutate(`conversations:${user.id}`);
    },
  });

  // Listen only once the conversation doc exists — the messages read rule
  // get()s the parent doc, so listening earlier would just error. The first
  // message makes it: then it is read again, and listened to.
  const thread = useChatThread({
    pairId,
    to: other?.id,
    listen: !!convo,
    onSent: () => {
      if (!convo) void mutateConvo();
    },
  });
  // The cards this thread is about — shared ones, and Resonance card links —
  // each looked up once, a few to a request, as messages come in or older
  // ones are read: what the cards in the bubbles and the「卡片與連結」list
  // look up (MessageCardRef, SharedCardRow).
  const cardKeys = useMemo(() => threadCardKeys(thread.messages), [thread.messages]);
  const sharedCards = useCardSummaries(cardKeys);
  const sharedCardIds = useMemo(
    () => [...new Set(thread.messages.flatMap((m) => (m.cardRef ? [m.cardRef] : [])))],
    [thread.messages],
  );
  // Links written in messages, each once, for the same list.
  const sharedLinks = useMemo(
    () => [
      ...new Map(
        thread.messages
          .flatMap((m) => linkify(m.text))
          .flatMap((seg) => (seg.type === 'link' ? [seg] : []))
          .map((l) => [l.url, l]),
      ).values(),
    ],
    [thread.messages],
  );
  // The newest message the conversation holds (not one still on its way):
  // what the unread counter is about.
  const lastMessage = useMemo(
    () => [...thread.messages].reverse().find((m) => m.delivery === 'delivered'),
    [thread.messages],
  );
  const lastMessageId = lastMessage?.id;

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const cardModalLoaded = useOpenedOnce(cardModalOpen);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  // Header「⋯」menu surfaces: in-thread search, the shared cards/links list,
  // and delete-with-confirm.
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A link that is easy to mistake for another place (an IP address, a
  // punycode name) waits here for the reader's yes before it opens.
  const [linkToConfirm, setLinkToConfirm] = useState<{ url: string; host: string } | null>(null);
  // The message a tap on a quote scrolled to, washed for a moment.
  const [flashId, setFlashId] = useState<string | null>(null);
  // A quoted message to scroll to once it is drawn (it may have needed older pages first).
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
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
    const incoming = !!lastMessage && lastMessage.senderId !== user.id;
    if (incoming || (convo.unread[user.id] ?? 0) > 0) {
      // The list and the header's badge listen to the conversation: they
      // hear the zeroed counter on their own, nothing to read again.
      void markConversationRead(pairId).then(() => void mutateConvo());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo, user?.id, pairId, lastMessageId]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // The「卡片與連結」modal's scroll area (hand-drawn rail replaces the native bar).
  const mediaScrollRef = useRef<HTMLDivElement>(null);

  // In-thread search runs over the whole conversation (older pages are read
  // for it) and narrows the scroller to the matching messages.
  const searching = searchOpen && thread.search.query.trim().length > 0;
  const hitIds = useMemo(() => new Set(thread.search.hits.map((h) => h.messageId)), [thread.search.hits]);
  const visibleMessages = useMemo(
    () => (searching ? thread.messages.filter((m) => hitIds.has(m.id)) : thread.messages),
    [searching, thread.messages, hitIds],
  );
  const rows = useMemo(() => threadRows(visibleMessages), [visibleMessages]);
  const newest = visibleMessages[visibleMessages.length - 1];

  // The newest message stays in view as messages come in (the viewer's own
  // always), older ones going in above leave the view where it was, and
  // scrolling up near the top reads the next older page.
  useThreadScroll(scrollerRef, {
    firstKey: visibleMessages[0]?.key,
    lastKey: newest?.key,
    lastIsOwn: !!newest && newest.senderId === user?.id,
    onNearTop: searching ? undefined : thread.loadOlder,
  });

  // A quote's original, once it is drawn: scroll to it and wash it for a moment.
  useEffect(() => {
    if (!jumpTarget) return;
    const row = [...(scrollerRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])].find(
      (el) => el.dataset.messageId === jumpTarget,
    );
    if (!row || !scrollerRef.current) return;
    centerRow(scrollerRef.current, row);
    setFlashId(jumpTarget);
    setJumpTarget(null);
    const id = jumpTarget;
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1000);
  }, [jumpTarget, visibleMessages]);

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
  // Sending never holds the composer: a message still on its way doesn't stop the next.
  const valid = hasBody && trimmed.length <= MESSAGE_MAX_LENGTH && !!pairId;

  function send() {
    if (!valid || !other || !pairId) return;
    // The message shows at once and goes out behind any still on their way;
    // one that fails stays in the thread with its retry.
    const queued = thread.send({ text: trimmed, cardRef: pendingCard?.id, noteRef });
    if (!queued) return;
    setError(null);
    setText('');
    setPendingCard(null);
    setNoteRef(undefined);
    inputRef.current?.focus();
  }

  /** Scrolls to a quote's original — reading older pages for it first, as far as that goes. */
  async function jumpTo(messageId: string) {
    if (await thread.ensureLoaded(messageId)) setJumpTarget(messageId);
  }

  function replyTo(message: ChatMessage) {
    thread.reply(message);
    inputRef.current?.focus();
  }

  function confirmDelete() {
    if (deleting || !pairId || !user) return;
    setDeleting(true);
    void deleteConversation(pairId)
      .then(() => {
        thread.forget();
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
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });

  const replyHandle = thread.replyingTo?.senderId === user?.id ? null : other.handle;

  return (
    <CardEmbedSourceContext.Provider value={sharedCards}>
      {/* In-thread search lives *in* the header: opening it swaps the
          avatar/name/menu for the input, and the close button sits exactly
          where the「⋯」trigger was. On single-pane phones the app header is
          gone, so a back control leads this row instead. */}
      <div className={styles.threadHeader}>
        {searchOpen ? (
          <>
            <span className={styles.headerSearchIcon}>
              <Icon name="search" size={17} />
            </span>
            <input
              className={styles.searchInput}
              value={thread.search.query}
              onChange={(e) => thread.setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('menuSearch')}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchOpen(false);
                  thread.setSearchQuery('');
                }
              }}
            />
            {searching && (
              <span className={styles.searchCount}>
                {thread.search.loading ? t('searchSearching') : t('searchCount', { count: thread.search.hits.length })}
              </span>
            )}
            <button
              type="button"
              className={styles.headerSearchClose}
              aria-label={t('searchClose')}
              onClick={() => {
                setSearchOpen(false);
                thread.setSearchQuery('');
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </>
        ) : (
          <>
            <Link href="/messages" className={styles.headerBack} aria-label={t('back')}>
              {/* translateY optically centres the arrow against the serif name,
                  whose ink sits a hair below its line-box centre. */}
              <span style={{ display: 'inline-flex', transform: 'scaleX(-1) translateY(1px)' }}>
                <Icon name="arrow-right" size={16} />
              </span>
            </Link>
            <Link href={profileHref} className={styles.threadAvatarLink} title={t('viewProfile')}>
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
                  ...safety.items,
                  { key: 'delete', icon: 'trash', label: t('menuDelete'), danger: true },
                ]}
                onChoose={(key) => {
                  if (safety.choose(key)) return;
                  if (key === 'search') setSearchOpen(true);
                  else if (key === 'media') setMediaOpen(true);
                  else if (key === 'delete') setConfirmingDelete(true);
                }}
              />
            )}
          </>
        )}
      </div>
      <div className={styles.threadDivider}>
        <Divider seed={41} spacing={0} strokeWidth={INK} />
      </div>

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
            {searching && !thread.search.loading && visibleMessages.length === 0 && (
              <p className={styles.quietNote}>{t('searchCount', { count: 0 })}</p>
            )}
            {/* Older pages: read as the reader nears the top, said here while they come. */}
            {!searching && thread.messages.length > 0 && (
              <div className={styles.olderRow}>
                {thread.olderError ? (
                  <button type="button" className={styles.olderRetry} onClick={() => thread.loadOlder()}>
                    {t('loadOlderError')} {t('retry')}
                  </button>
                ) : thread.hasOlder ? (
                  thread.loadingOlder && t('loadingOlder')
                ) : (
                  thread.ready && t('beginning')
                )}
              </div>
            )}
            {rows.map(({ message: m, position, dayLabel, timeLabel }) => {
              const own = m.senderId === user?.id;
              return (
                <div key={m.key} style={{ display: 'contents' }}>
                  {dayLabel && <span className={styles.dayLabel}>{dayFmt.format(m.sentAt)}</span>}
                  {timeLabel && <span className={styles.dayLabel}>{timeFmt.format(m.sentAt)}</span>}
                  <div
                    className={styles.bubbleRow}
                    data-own={own || undefined}
                    data-message-id={m.id}
                    data-message-key={m.key}
                    data-run={position}
                    data-delivery={m.delivery}
                    data-flash={flashId === m.id || undefined}
                  >
                    <div className={styles.messageStack} data-own={own || undefined}>
                      {m.replyTo && user && (
                        <ReplyQuote
                          quote={m.replyTo}
                          own={own}
                          viewerId={user.id}
                          otherHandle={other.handle}
                          canJump={thread.messages.some((x) => x.id === m.replyTo!.id) || thread.hasOlder}
                          onJump={(id) => void jumpTo(id)}
                        />
                      )}
                      {m.cardRef && <MessageCardRef cardId={m.cardRef} />}
                      {(m.text || m.noteRef) && (
                        <div className={styles.bubbleWrap}>
                          <MessageBubble
                            id={m.key}
                            text={m.text}
                            own={own}
                            title={fullFmt.format(m.sentAt)}
                            quoteLabel={m.noteRef ? t('quotedNote') : undefined}
                            onConfirmLink={setLinkToConfirm}
                          />
                        </div>
                      )}
                      {m.preview && <LinkPreviewCard preview={m.preview} onConfirmLink={setLinkToConfirm} />}
                      {m.delivery === 'sending' && <SendingNote />}
                      {m.delivery === 'failed' && (
                        <span className={styles.deliveryNote} data-failed>
                          <button type="button" onClick={() => thread.retry(m.key)}>
                            {t('sendFailed')}
                          </button>
                          <button type="button" onClick={() => thread.discard(m.key)}>
                            {t('discardFailed')}
                          </button>
                        </span>
                      )}
                    </div>
                    {m.delivery === 'delivered' && (
                      <span className={styles.rowActions}>
                        <button type="button" aria-label={t('reply')} title={t('reply')} onClick={() => replyTo(m)}>
                          <Icon name="reply" size={16} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending attachments ride the next message — and so does the message it answers. */}
          {(noteRef || pendingCard || thread.replyingTo) && (
            <div className={styles.attachments}>
              {thread.replyingTo && (
                <span className={styles.attachChip}>
                  <Icon name="reply" size={14} />
                  <span className={styles.attachCardTitle}>
                    {replyHandle ? t('replyingTo', { handle: replyHandle }) : t('replyingToSelf')}
                    {' · '}
                    {thread.replyingTo.text || t('replyCard')}
                  </span>
                  <button
                    type="button"
                    aria-label={t('replyCancel')}
                    className={styles.attachRemove}
                    onClick={() => thread.cancelReply()}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              )}
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
              style={{ opacity: valid ? 1 : 0.5, pointerEvents: valid ? 'auto' : 'none' }}
            >
              <OrganicButton variant="solid" size="sm" onClick={send} style={{ height: '100%' }}>
                {t('send')}
              </OrganicButton>
            </div>
          </div>
          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-terracotta)', margin: '6px 0 0' }}>{error}</p>
          )}

          {cardModalLoaded && (
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
          )}

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
              <div className={styles.mediaArea}>
                <div ref={mediaScrollRef} className={styles.mediaBody}>
                  {sharedCardIds.length > 0 && (
                    <section>
                      <h4 className={styles.mediaSection}>{t('mediaCards')}</h4>
                      {sharedCardIds.map((id, i) => (
                        <Fragment key={id}>
                          {i > 0 && <Divider seed={53 + i * 7} spacing={0} />}
                          <SharedCardRow cardId={id} />
                        </Fragment>
                      ))}
                    </section>
                  )}
                  {sharedLinks.length > 0 && (
                    <section>
                      <h4 className={styles.mediaSection}>{t('mediaLinks')}</h4>
                      {sharedLinks.map((link, i) => (
                        <Fragment key={link.url}>
                          {i > 0 && <Divider seed={97 + i * 11} spacing={0} />}
                          <a
                            className={styles.mediaLinkRow}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow ugc"
                            onClick={(e) => {
                              if (!link.suspicious) return;
                              e.preventDefault();
                              setLinkToConfirm({ url: link.url, host: link.host });
                            }}
                          >
                            {link.text}
                          </a>
                        </Fragment>
                      ))}
                    </section>
                  )}
                </div>
                <OrganicScrollbar targetRef={mediaScrollRef} seed={71} />
              </div>
            )}
          </Modal>

          {/* Before a link to an IP address or a punycode name opens. */}
          <Modal
            open={!!linkToConfirm}
            onClose={() => setLinkToConfirm(null)}
            seed={61}
            maxWidth={400}
            ariaLabel={t('linkConfirmTitle')}
          >
            <h3 className={styles.mediaTitle}>{t('linkConfirmTitle')}</h3>
            <p className={styles.mediaSubtitle}>{t('linkConfirmBody', { host: linkToConfirm?.host ?? '' })}</p>
            <div className={styles.confirmActions}>
              <OrganicButton variant="text" size="sm" onClick={() => setLinkToConfirm(null)}>
                {t('linkConfirmCancel')}
              </OrganicButton>
              <OrganicButton
                variant="solid"
                size="sm"
                onClick={() => {
                  if (linkToConfirm) window.open(linkToConfirm.url, '_blank', 'noopener,noreferrer');
                  setLinkToConfirm(null);
                }}
              >
                {t('linkConfirmOpen')}
              </OrganicButton>
            </div>
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
              <OrganicButton variant="text" size="sm" onClick={() => setConfirmingDelete(false)}>
                {t('deleteCancel')}
              </OrganicButton>
              <OrganicButton variant="danger" size="sm" onClick={confirmDelete}>
                {deleting ? '…' : t('deleteConfirm')}
              </OrganicButton>
            </div>
          </Modal>
          {safety.modals}
        </>
      )}
    </CardEmbedSourceContext.Provider>
  );
}

/**
 * One shared card as a compact row in the「卡片與連結」list: organic thumb +
 * title, linking to the card page. Looked up in the thread's shared-card
 * previews, like an in-thread embed — a card the viewer can no longer see
 * simply renders nothing.
 */
function SharedCardRow({ cardId }: { cardId: string }) {
  const data = useCardEmbed(`/card/${cardId}`);
  if (data.status !== 'ready') return null;
  const { card } = data;
  return (
    <Link
      href={`/card/${card.slug ?? card.id}` as `/card/${string}`}
      className={styles.mediaRow}
    >
      <span className={styles.mediaThumb}>
        <OrganicImage src={card.media?.url} alt={card.thoughtCore} seed={7} ratio={1}>
          {!card.media?.url && (
            <span
              className={styles.mediaThumbFallback}
              style={{ background: `oklch(90% 0.06 ${card.accentHue ?? 55})` }}
            />
          )}
        </OrganicImage>
      </span>
      <span className={styles.mediaRowTitle}>{card.thoughtCore}</span>
    </Link>
  );
}

/** Said under a message of the viewer's own once it has been on its way for a second (a quick send says nothing). */
function SendingNote() {
  const t = useTranslations('messages');
  const [late, setLate] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setLate(true), 1000);
    return () => window.clearTimeout(id);
  }, []);
  return late ? <span className={styles.deliveryNote}>{t('sending')}</span> : null;
}
