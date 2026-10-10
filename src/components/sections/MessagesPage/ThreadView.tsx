'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { OrganicScrollbar, organicScrollTarget } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { CardEmbedSourceContext, useCardEmbed } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { useSafetyActions } from '@/components/molecules/SafetyActions/useSafetyActions';
import { seedFromString } from '@/lib/design/prng';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCardSummaries, useMyBlockedIds } from '@/lib/data/hooks';
import { OLDER_PAGE, useChatThread } from '@/lib/data/thread';
import { resonanceCardKey, threadCardKeys } from '@/lib/chat/cardLink';
import { footComposes, threadFoot } from '@/lib/chat/foot';
import { threadRows } from '@/lib/chat/rows';
import type { TextRange } from '@/lib/chat/search';
import { getUserByHandle, isConnected } from '@/lib/db/firestore/client/reads';
import {
  conversationId,
  deleteConversation,
  getConversation,
  markConversationRead,
} from '@/lib/db/firestore/client/messages';
import { linkify } from '@/lib/links/linkify';
import { messageLinkProps } from './MessageBubble';
import { MessageRow } from './MessageRow';
import { MessageMenuOverlay } from './MessageMenuOverlay';
import { SearchResults } from './ThreadSearch';
import { ThreadComposer } from './ThreadComposer';
import { ThreadHeaderChrome } from './ThreadHeaderChrome';
import { ThreadActionsContext, type PressedMessage, type ThreadActions } from './threadActions';
import { centerRow, useThreadScroll } from './useThreadScroll';
import pageStyles from './MessagesPage.module.css';
import styles from './Thread.module.css';

/** How many messages before one gone to are drawn with it (when a search read it, and the thread hadn't drawn it). */
const JUMP_CONTEXT = 10;
/**
 * A message gone to further than this from what is drawn (a match, a quote's original, pages back) is drawn
 * as a stretch of its own — it, the few before it and a page after — rather than with everything between.
 */
const FAR = 2 * OLDER_PAGE;

export interface ThreadViewProps {
  handle: string;
  /**
   * A note the thread was opened for (a bell row's link, an older push): the
   * thread goes to it and the next message answers it — or, for an older note
   * that never came into the thread, quotes it.
   */
  replyNote?: { noteId: string; cardId: string };
}

/**
 * One open conversation, laid out the way Messenger lays one out, drawn in
 * our hand: one person's messages sent close together stack in runs, their
 * face beside the last of each of their runs; a reply lies over the message
 * it quotes; a link's preview and a shared Resonance card sit inside their
 * bubbles. On a pointer device a message's tools show beside it on hover; on
 * a touch screen pressing and holding lifts it out with its menu.
 *
 * The conversation doc is created lazily on the first send (not on page
 * open), so browsing to a connected person's thread never litters either list
 * with empty conversations. Its messages — the newest live once the doc
 * exists, older ones paged in as the reader scrolls up or searches, and the
 * viewer's own still on their way — come from {@link useChatThread}.
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
  // Read again on coming back to the tab, as the conversation is: the other may have taken back the
  // resonance that connected the two meanwhile (this browser's own take-backs read it again themselves).
  const { data: connected } = useSWR(
    user && other && user.id !== other.id ? `connected:${pairId}` : null,
    () => isConnected(user!.id, other!.id),
    { revalidateOnFocus: true },
  );

  // Report / block the other participant from the header「⋯」menu. Blocking
  // ends the connection, so the thread freezes (see firestore.rules).
  const { data: blocked } = useMyBlockedIds();
  const blockedOther = !!other && !!blocked?.has(other.id);
  const safety = useSafetyActions({
    report: {
      type: 'message',
      id: pairId ?? '',
      userId: other?.id ?? '',
      handle: other?.handle,
      contextId: pairId,
    },
    isBlocked: blockedOther,
    onBlockedChange: () => {
      void globalMutate(`connected:${pairId}`);
      if (user) void globalMutate(`conversations:${user.id}`);
    },
  });

  // What the foot offers: whose turn it is between two people who aren't connected (the one who left notes —
  // a letter — waits for the other, whose answer connects them), and nothing across the viewer's block.
  const foot = threadFoot(connected, blockedOther, convo?.request?.from, user?.id, other?.id);
  // A composer to write in, and so a message to reply to.
  const composes = footComposes(foot);

  // Listen only once the conversation doc exists — the messages read rule
  // get()s the parent doc, so listening earlier would just error. The first
  // message makes it: then it is read again, and listened to.
  const thread = useChatThread({
    pairId,
    to: other?.id,
    listen: !!convo,
    onSent: () => {
      if (!convo) void mutateConvo();
      // An answer to their letter connected the two: the thread is an ordinary one now (asked again while
      // the first read is still out too: it may answer from before the send).
      if (connected !== true) {
        void globalMutate(`connected:${pairId}`);
        void mutateConvo();
      }
    },
  });
  // A note the thread was opened for that isn't in it (left before notes came into threads): the card it was
  // left on is looked up with the thread's cards, so its quote rides the next message only when the card is
  // named — answering a note on an anonymous card with it would tell its writer whose card it was.
  const [olderNote, setOlderNote] = useState<{ noteId: string; cardId: string } | null>(null);

  // The stretch of what is held that the thread draws. Its first message, once a search or a jump has read
  // further back than the reader had scrolled: what that read is held (for the search, for going to a
  // message), not laid out — a long conversation's thousands of rows aren't drawn for it. Scrolling up draws a
  // page more of what is held before reading further back. Null: from the first message held.
  const [drawFrom, setDrawFrom] = useState<string | null>(null);
  // Its last message, while the thread draws a stretch further up — gone to a message far back, it draws that
  // message, the few before it and a page after, not everything down to the newest; scrolling down draws a
  // page more, and the way back down draws the newest again. Null: down to the newest, and on as they come.
  const [drawTo, setDrawTo] = useState<string | null>(null);
  const drawnFrom = drawFrom == null ? 0 : Math.max(0, thread.messages.findIndex((m) => m.key === drawFrom));
  const toIndex = drawTo == null ? -1 : thread.messages.findIndex((m) => m.key === drawTo);
  const tail = toIndex < 0;
  const drawnTo = tail ? thread.messages.length - 1 : toIndex;
  const searchingAll = thread.search.query.trim().length > 0;
  /** What is read from here on (for a search, for a jump) is held, not drawn: the stretch starts where it does now. */
  const holdOlder = () => {
    if (drawFrom == null && thread.messages.length) setDrawFrom(thread.messages[0].key);
  };
  useEffect(() => {
    if (searchingAll) holdOlder();
    // Only as a search starts reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingAll]);
  useEffect(() => {
    setDrawFrom(null);
    setDrawTo(null);
  }, [pairId]);
  const drawn = useMemo(
    () => (drawnFrom === 0 && tail ? thread.messages : thread.messages.slice(drawnFrom, drawnTo + 1)),
    [thread.messages, drawnFrom, drawnTo, tail],
  );
  /** Draws from the message at `index` of those held (the start of them all: no limit again). */
  const drawFromIndex = (index: number) => setDrawFrom(index <= 0 ? null : (thread.messages[index]?.key ?? null));
  /** Draws down to the message at `index` of those held (the newest, or past it: down to the newest again). */
  const drawToIndex = (index: number) =>
    setDrawTo(index >= thread.messages.length - 1 ? null : (thread.messages[index]?.key ?? null));
  // The newest message held when the stretch was drawn: one newer has come in below it since.
  const [stretchNewest, setStretchNewest] = useState<string | undefined>();
  const newestHeld = thread.messages[thread.messages.length - 1];
  useEffect(() => {
    if (tail) setStretchNewest(undefined);
    else setStretchNewest((cur) => cur ?? newestHeld?.key);
    // Only as a stretch is drawn, or the newest is again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail]);

  // The「卡片與連結」list (the header menu's).
  const [mediaOpen, setMediaOpen] = useState(false);
  // The cards this thread is about — shared ones, and Resonance card links —
  // each looked up once, a few to a request, as messages come in or older
  // ones are drawn: what the cards in the bubbles and the「卡片與連結」list
  // (all of the thread's, while it is open) look up. Held still between
  // answers, so the rows reading it draw again only when a card arrives.
  const cardKeys = useMemo(
    () => [...threadCardKeys(mediaOpen ? thread.messages : drawn), ...(olderNote ? [olderNote.cardId] : [])],
    [thread.messages, drawn, mediaOpen, olderNote],
  );
  const summaries = useCardSummaries(cardKeys);
  const summariesReady = summaries?.status === 'ready' ? summaries : null;
  const sharedCards = useMemo(
    () => summaries,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summaries?.status, summariesReady?.cards, summariesReady?.asked, summariesReady?.failed],
  );
  const noteQuote = useMemo(() => {
    if (!olderNote || summaries?.status !== 'ready' || !summaries.asked?.has(olderNote.cardId)) return undefined;
    const card = summaries.cards.cards.find((c) => c.id === olderNote.cardId);
    return card && !card.anonymous ? olderNote : undefined;
  }, [olderNote, summaries]);
  // Every card this thread is about — shared, or linked to (the bubbles' own detection) — each once.
  const sharedCardKeys = useMemo(() => (mediaOpen ? threadCardKeys(thread.messages) : []), [mediaOpen, thread.messages]);
  // Links written in messages, each once, for the same list — but a link to one of our cards, which is among
  // its cards. Worked out while the list is open only: it reads every word of the thread.
  const mediaLinks = useMemo(
    () =>
      mediaOpen
        ? [
            ...new Map(
              thread.messages
                .flatMap((m) => linkify(m.text))
                .flatMap((seg) => (seg.type === 'link' && !resonanceCardKey(seg.url) ? [seg] : []))
                .map((l) => [l.url, l]),
            ).values(),
          ]
        : [],
    [mediaOpen, thread.messages],
  );
  // The newest message the conversation holds (not one still on its way):
  // what the unread counter is about.
  const lastMessage = useMemo(
    () => [...thread.messages].reverse().find((m) => m.delivery === 'delivered'),
    [thread.messages],
  );
  const lastMessageId = lastMessage?.id;

  const [error, setError] = useState<string | null>(null);
  // Header「⋯」menu surfaces: in-thread search, the shared cards/links list,
  // and delete-with-confirm.
  const [searchOpen, setSearchOpen] = useState(false);
  // While searching: the list of matches over the thread, or the thread itself at the match picked from it.
  const [listShown, setListShown] = useState(true);
  const [hitIndex, setHitIndex] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A link that is easy to mistake for another place (an IP address, a
  // punycode name) waits here for the reader's yes before it opens.
  const [linkToConfirm, setLinkToConfirm] = useState<{ url: string; host: string } | null>(null);
  // The message a quote's click scrolled to, washed for a moment.
  const [flashId, setFlashId] = useState<string | null>(null);
  // A message to scroll to once it is drawn (it may have needed older pages first), and whether to wash it.
  const [jumpTarget, setJumpTarget] = useState<{ id: string; flash: boolean } | null>(null);
  // The message a long-press lifted out, with its menu.
  const [pressed, setPressed] = useState<PressedMessage | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // Between two people who aren't connected, a new message is an answer to a letter (theirs to the viewer's,
  // or the viewer's own to theirs, which the thread may hear before the send's answer): it connected them, so
  // whether they are is read again — and the conversation, whose letter is gone. Asked again while the first
  // read is still out too, as onSent does: that one may answer from before the message.
  const seenLast = useRef(lastMessageId);
  useEffect(() => {
    const before = seenLast.current;
    seenLast.current = lastMessageId;
    if (!before || before === lastMessageId || connected === true || !pairId) return;
    void globalMutate(`connected:${pairId}`);
    void mutateConvo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // Whether a message lies under the header's paper (the history scrolled under it): its pen line inks in whole.
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [under, setUnder] = useState(false);
  useEffect(() => {
    if (!scrollerEl) return;
    const check = () => setUnder(scrollerEl.scrollTop > 1);
    check();
    scrollerEl.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(scrollerEl);
    return () => {
      scrollerEl.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [scrollerEl]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The「卡片與連結」modal's scroll area (hand-drawn rail replaces the native bar).
  const mediaScrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => threadRows(drawn), [drawn]);
  const newest = drawn[drawn.length - 1];
  // On its way to a message (a quote's original, a match, a note): no older page is read meanwhile — one
  // landing mid-glide would stop the glide short of it.
  const jumping = useRef(false);

  // The newest message stays in view as messages come in (the viewer's own
  // always), older ones going in above leave the view where it was, and
  // scrolling up near the top draws a page more of what is held, else reads
  // the next older page; down near the foot of a stretch further up, it draws
  // a page more of it.
  const scroll = useThreadScroll(scrollerRef, {
    firstKey: drawn[0]?.key,
    lastKey: newest?.key,
    lastIsOwn: !!newest && newest.senderId === user?.id,
    tail,
    onNearTop: () => {
      if (jumping.current) return;
      if (drawnFrom > 0) drawFromIndex(drawnFrom - OLDER_PAGE);
      else {
        // At the first message held (and no search reading back): what is read next is drawn as it comes.
        if (drawFrom != null && !searchingAll) setDrawFrom(null);
        thread.loadOlder();
      }
    },
    onNearBottom: () => {
      if (!jumping.current && !tail) drawToIndex(drawnTo + OLDER_PAGE);
    },
  });

  // Back to the latest message from a stretch further up: the newest are drawn again (the stretch with them,
  // when they are only a page away — the way down glides; else in its place), then the thread is at the foot.
  const wantBottom = useRef<ScrollBehavior | null>(null);
  const toLatest = () => {
    if (tail) {
      scroll.toBottom('smooth');
      return;
    }
    const near = thread.messages.length - 1 - drawnTo <= OLDER_PAGE;
    wantBottom.current = near ? 'smooth' : 'auto';
    if (!near) drawFromIndex(thread.messages.length - OLDER_PAGE);
    setDrawTo(null);
  };
  useLayoutEffect(() => {
    const how = wantBottom.current;
    if (!tail || !how) return;
    wantBottom.current = null;
    scroll.toBottom(how);
    // Only once the newest are drawn again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail]);
  // The viewer's own message sent from a stretch further up: the thread goes down to it.
  const lastHeldKey = useRef(newestHeld?.key);
  useEffect(() => {
    const before = lastHeldKey.current;
    lastHeldKey.current = newestHeld?.key;
    if (!tail && before && newestHeld && newestHeld.key !== before && newestHeld.senderId === user?.id) toLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestHeld?.key]);

  // Search runs over the whole conversation (older pages are read for it);
  // every match is marked in its bubble, the one being looked at stronger.
  const query = thread.search.query;
  const hits = thread.search.hits;
  const searching = searchOpen && query.trim().length > 0;
  const hitRanges = useMemo(
    () => new Map<string, readonly TextRange[]>(searching ? hits.map((h) => [h.messageId, h.ranges]) : []),
    [searching, hits],
  );
  const currentHit = searching && hitIndex != null ? hits[hitIndex]?.messageId : undefined;

  // A message, once it is drawn: centre it in the thread (and, for a quote's original, wash it for a moment
  // once it has arrived — washed on the way, it would be over before it is seen).
  useEffect(() => {
    if (!jumpTarget) return;
    // Held but not drawn (a search or the jump read it): the thread draws it first, with a few before it — the
    // stretch drawn reaching on to it, or, from far away, a stretch of its own (it and a page after it).
    const at = thread.messages.findIndex((m) => m.id === jumpTarget.id);
    if (at >= 0 && (at < drawnFrom || at > drawnTo)) {
      jumping.current = true;
      if (at < drawnFrom && drawnFrom - (at - JUMP_CONTEXT) <= FAR) drawFromIndex(at - JUMP_CONTEXT);
      else if (at > drawnTo && at + JUMP_CONTEXT - drawnTo <= FAR) drawToIndex(at + JUMP_CONTEXT);
      else {
        drawFromIndex(at - JUMP_CONTEXT);
        drawToIndex(at + OLDER_PAGE);
      }
      return;
    }
    const scroller = scrollerRef.current;
    const row = scroller?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(jumpTarget.id)}"]`);
    if (!scroller || !row) return;
    jumping.current = true;
    scroll.leaveBottom();
    const arrived = centerRow(scroller, row);
    setJumpTarget(null);
    const id = jumpTarget.id;
    const flash = jumpTarget.flash;
    void arrived.then(() => {
      jumping.current = false;
      if (!flash) return;
      // Off first, so a second jump to the same message washes it again.
      setFlashId(null);
      window.requestAnimationFrame(() => setFlashId(id));
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTarget, rows]);

  // The thread's labels and times, worked out once per message rather than on every draw.
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short' }), [locale]);
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }), [locale]);
  const fullFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    [locale],
  );
  const laidOut = useMemo(
    () =>
      rows.map((r, i) => {
        const m = r.message;
        const own = m.senderId === user?.id;
        return {
          ...r,
          own,
          label: r.dayLabel ? dayFmt.format(m.sentAt) : r.timeLabel ? timeFmt.format(m.sentAt) : undefined,
          fullTime: fullFmt.format(m.sentAt),
          // Their face beside the last bubble of each of their runs.
          face: !own && !r.joinsBelow ? (other ?? null) : null,
          // A run still on its way says so once, under its newest message: the stack stays one stack.
          deliveryLine: !(r.joinsBelow && rows[i + 1]?.message.delivery === 'sending'),
        };
      }),
    [rows, user?.id, other, dayFmt, timeFmt, fullFmt],
  );

  // What every message can ask of the thread — the same functions for as long as the conversation is open.
  const live = useRef({ thread, router, holdOlder, composes });
  live.current = { thread, router, holdOlder, composes };
  // A reply picked while there was a composer never comes back with the next one: the foot gave way meanwhile.
  useEffect(() => {
    if (!composes) thread.cancelReply();
    // Only as the composer goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composes]);
  const actions = useMemo<ThreadActions>(
    () => ({
      viewerId: user?.id ?? '',
      otherHandle: other?.handle ?? '',
      canWrite: composes,
      openLink: (link, e) => {
        // An address easy to mistake for another asks first, however it was opened.
        if (link.suspicious) {
          e?.preventDefault();
          setLinkToConfirm({ url: link.url, host: link.host });
          return;
        }
        // A new tab asked for on purpose is the browser's to open.
        if (e && 'button' in e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return;
        const card = resonanceCardKey(link.url);
        if (card) {
          e?.preventDefault();
          live.current.router.push(`/card/${card}`);
        } else if (!e) {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        }
      },
      reply: (message) => {
        // Nothing to reply in without a composer (a letter waiting for its answer, not connected).
        if (!live.current.composes) return;
        live.current.thread.reply(message);
        inputRef.current?.focus();
      },
      jumpTo: (id) => {
        const { thread: chat, holdOlder: hold } = live.current;
        // Pages back: what is read on the way is held, not drawn, and no other page is read meanwhile.
        if (!chat.messages.some((m) => m.id === id)) {
          hold();
          jumping.current = true;
        }
        void chat.ensureLoaded(id).then((held) => {
          if (held) setJumpTarget({ id, flash: true });
          else jumping.current = false;
        });
      },
      retry: (key) => live.current.thread.retry(key),
      discard: (key) => live.current.thread.discard(key),
      copy: (text) => {
        // A copy the browser refuses (no focus, a policy) says nothing: no「已複製」for what wasn't.
        void navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          },
          () => undefined,
        );
      },
      press: setPressed,
    }),
    [user?.id, other?.handle, composes],
  );

  // The note the thread was opened for: once the conversation's first messages are in (older ones read for it
  // if need be), it is gone to, washed and answered; one that isn't in the conversation is an older note.
  const noteAsked = useRef<string | null>(null);
  const [noteFound, setNoteFound] = useState<string | null>(null);
  useEffect(() => {
    if (!replyNote || noteAsked.current === replyNote.noteId || convo === undefined || (convo && !thread.ready)) return;
    noteAsked.current = replyNote.noteId;
    setOlderNote(null);
    if (!convo) {
      setOlderNote(replyNote);
      return;
    }
    if (!thread.messages.some((m) => m.id === replyNote.noteId)) {
      holdOlder();
      jumping.current = true;
    }
    void thread.ensureLoaded(replyNote.noteId).then((held) => {
      if (held) setNoteFound(replyNote.noteId);
      else {
        jumping.current = false;
        setOlderNote(replyNote);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyNote?.noteId, convo, thread.ready]);
  useEffect(() => {
    const note = noteFound ? thread.messages.find((m) => m.id === noteFound) : undefined;
    if (!note) return;
    setNoteFound(null);
    actions.reply(note);
    setJumpTarget({ id: note.id, flash: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteFound, thread.messages]);

  // Escape leaves the search wherever the focus is (after a click on a match it isn't in the field) — unless
  // something over the thread (a message's menu, a dialog: the link's confirm, the card picker) is the one to
  // close, whichever of the two hears the key first.
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || pressed) return;
      if (document.querySelector('[role="menu"], [aria-modal="true"]')) return;
      closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function closeSearch() {
    setSearchOpen(false);
    setHitIndex(null);
    setListShown(true);
    thread.setSearchQuery('');
  }

  /** Looks at match `i` (newest first): the list goes away and the thread takes that message to its middle. */
  function pickHit(i: number) {
    const hit = hits[i];
    if (!hit) return;
    setHitIndex(i);
    setListShown(false);
    setJumpTarget({ id: hit.messageId, flash: false });
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
    return <p className={pageStyles.quietNote}>{t('userNotFound')}</p>;
  }

  const profileHref = `/u/${other.handle}` as const;
  // Not connected, and no letter of theirs to answer: the way to them is their profile.
  const notConnected = (
    <div className={styles.letterLine}>
      <p className={pageStyles.quietNote}>{t('notConnected')}</p>
      <Link href={profileHref} className={styles.letterLink}>
        {t('viewProfile')}
      </Link>
    </div>
  );
  const replyHandle = thread.replyingTo?.senderId === user?.id ? null : other.handle;
  // The way back to the latest message — not under the search's list, which covers the thread.
  // (A word that something was copied takes its place for a moment.)
  // (Over a stretch further up, it is always offered: the newest aren't under it.)
  const newBelow = scroll.newBelow || (!tail && !!stretchNewest && newestHeld?.key !== stretchNewest);
  const showPill = !copied && !(searchOpen && listShown) && (!tail || newBelow || (scroll.farUp && !scroll.atBottom));

  return (
    <CardEmbedSourceContext.Provider value={sharedCards}>
      <ThreadActionsContext.Provider value={actions}>
        {/* In-thread search lives *in* the header: opening it swaps the
            avatar/name/menu for the field, and its close sits exactly where
            the「⋯」trigger was. Once a match is picked from the list, the
            header steps through the matches. On single-pane phones the app
            header is gone, so a back control leads this row instead. */}
        <div className={pageStyles.threadHeader}>
          <ThreadHeaderChrome under={under} />
          {searchOpen ? (
            <>
              <span className={pageStyles.headerSearchIcon}>
                <Icon name="search" size={17} />
              </span>
              <input
                className={pageStyles.searchInput}
                value={query}
                onChange={(e) => {
                  thread.setSearchQuery(e.target.value);
                  setHitIndex(null);
                  setListShown(true);
                }}
                onClick={() => setListShown(true)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('menuSearch')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    // Enter looks at the newest match, then steps back through the older ones (Shift: forward).
                    if (listShown || hitIndex == null) pickHit(0);
                    else pickHit(Math.max(0, Math.min(hits.length - 1, hitIndex + (e.shiftKey ? -1 : 1))));
                  }
                }}
              />
              {!listShown && hitIndex != null && hits.length > 0 && (
                <>
                  <span className={pageStyles.searchCount}>
                    {t('searchPosition', { index: hitIndex + 1, count: hits.length })}
                  </span>
                  <BareIconButton
                    icon="chevron-down"
                    rotate={180}
                    label={t('searchPrevious')}
                    tip="below"
                    disabled={hitIndex >= hits.length - 1}
                    onClick={() => pickHit(hitIndex + 1)}
                  />
                  <BareIconButton
                    icon="chevron-down"
                    label={t('searchNext')}
                    tip="below"
                    disabled={hitIndex <= 0}
                    onClick={() => pickHit(hitIndex - 1)}
                  />
                </>
              )}
              <BareIconButton icon="close" label={t('searchClose')} iconSize={16} tip="below" tipAlign="end" onClick={closeSearch} />
            </>
          ) : (
            <>
              <Link href="/messages" className={pageStyles.headerBack} aria-label={t('back')}>
                {/* translateY optically centres the arrow against the serif name,
                    whose ink sits a hair below its line-box centre. */}
                <span style={{ display: 'inline-flex', transform: 'scaleX(-1) translateY(1px)' }}>
                  <Icon name="arrow-right" size={16} />
                </span>
              </Link>
              <Link href={profileHref} className={pageStyles.threadAvatarLink} title={t('viewProfile')}>
                <HandDrawnAvatar
                  src={other.avatarUrl}
                  initials={other.initials}
                  size={38}
                  color={other.accentColor}
                  seed={Number(other.avatarSeed) || 3}
                />
              </Link>
              <Link href={profileHref} className={pageStyles.threadHandle}>
                {other.handle}
              </Link>
              <span className={pageStyles.threadHeaderSpacer} />
              {convo && (
                <OrganicMenu
                  label={t('moreMenu')}
                  seed={seedFromString(convo.id)}
                  // A glyph on the header's paper, in the back arrow's ink, its name hanging under it.
                  bare
                  tone="ink"
                  tip="below"
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
        {connected === false && !convo ? (
          // Someone the viewer isn't connected with and has never written with: nothing to show but that.
          convo === null && notConnected
        ) : (
          <>
            <div className={styles.body}>
              <div
                ref={(el) => {
                  scrollerRef.current = el;
                  setScrollerEl(el);
                }}
                className={styles.scroller}
              >
                {thread.ready && thread.messages.length === 0 && <p className={pageStyles.quietNote}>{t('noMessagesYet')}</p>}
                {convo === null && !thread.ready && <p className={pageStyles.quietNote}>{t('noMessagesYet')}</p>}
                {/* Older pages: read as the reader nears the top, said here while they come. The row
                    keeps its height, so its words coming and going never nudge the messages under it. */}
                {drawn.length > 0 && (
                  <div className={styles.older}>
                    {drawnFrom > 0 ? null : thread.olderError ? (
                      <>
                        <span>{t('loadOlderError')}</span>
                        <OrganicButton variant="textAccent" size="sm" onClick={() => thread.loadOlder()}>
                          {t('retry')}
                        </OrganicButton>
                      </>
                    ) : thread.hasOlder ? (
                      thread.loadingOlder && (
                        <>
                          <SketchLoader size={20} />
                          <span>{t('loadingOlder')}</span>
                        </>
                      )
                    ) : (
                      thread.ready && <span>{t('beginning')}</span>
                    )}
                  </div>
                )}
                {laidOut.map((r) => (
                  <MessageRow
                    key={r.message.key}
                    message={r.message}
                    own={r.own}
                    position={r.position}
                    label={r.label}
                    joinsAbove={r.joinsAbove}
                    face={r.face}
                    deliveryLine={r.deliveryLine}
                    highlights={hitRanges.get(r.message.id)}
                    hitStrong={currentHit === r.message.id}
                    flash={flashId === r.message.id}
                    lifted={pressed?.message.key === r.message.key}
                    fullTime={r.fullTime}
                  />
                ))}
              </div>
              {/* Where the thread meets what is fixed under it: the paper dissolving upward over the messages. */}
              <div className={styles.edge} aria-hidden />
              {showPill && (
                <Pill
                  className={styles.pill}
                  onClick={toLatest}
                  icon="chevron-down"
                  label={newBelow ? t('newMessages') : t('jumpToLatest')}
                />
              )}
              {copied && <Pill className={styles.pill} label={t('copied')} />}
              {searchOpen && listShown && (
                <SearchResults
                  query={query}
                  hits={hits}
                  messages={thread.messages}
                  viewerId={user?.id ?? ''}
                  otherHandle={other.handle}
                  loading={thread.search.loading}
                  onPick={pickHit}
                />
              )}
            </div>

            {foot === 'awaiting' ? (
              // Their answer is what connects the two: until it comes, nothing more to write here.
              <p className={styles.letterLine}>{t('awaitingReply')}</p>
            ) : foot === 'closed' ? (
              notConnected
            ) : (
              <>
                {foot === 'answer' && <p className={styles.letterHint}>{t('replyToConnect', { handle: other.handle })}</p>}
                <ThreadComposer
                  inputRef={inputRef}
                  otherHandle={other.handle}
                  replyingTo={thread.replyingTo}
                  replyHandle={replyHandle}
                  onCancelReply={thread.cancelReply}
                  replyNote={noteQuote}
                  send={thread.send}
                  ready={!!pairId}
                />
              </>
            )}
            {error && <p className={styles.error}>{error}</p>}

            {pressed && (
              <MessageMenuOverlay
                pressed={pressed}
                own={pressed.message.senderId === user?.id}
                fullTime={fullFmt.format(pressed.message.sentAt)}
                onClose={() => setPressed(null)}
              />
            )}

            {/* Everything shared in this thread: card embeds and plain links. */}
            <Modal
              open={mediaOpen}
              onClose={() => setMediaOpen(false)}
              seed={53}
              maxWidth={480}
              ariaLabel={t('mediaTitle')}
              // A list with nothing to do at its foot: the close lies there.
              closeButton
            >
              <h3 className={pageStyles.mediaTitle}>{t('mediaTitle')}</h3>
              <p className={pageStyles.mediaSubtitle}>{t('mediaSubtitle')}</p>
              {sharedCardKeys.length === 0 && mediaLinks.length === 0 ? (
                <p className={pageStyles.quietNote}>{t('mediaEmpty')}</p>
              ) : (
                <div className={pageStyles.mediaArea}>
                  <div ref={mediaScrollRef} className={`${pageStyles.mediaBody} ${organicScrollTarget}`}>
                    {sharedCardKeys.length > 0 && (
                      <section>
                        <h4 className={pageStyles.mediaSection}>{t('mediaCards')}</h4>
                        {sharedCardKeys.map((key, i) => (
                          <Fragment key={key}>
                            {i > 0 && <Divider seed={53 + i * 7} spacing={0} />}
                            <SharedCardRow cardKey={key} />
                          </Fragment>
                        ))}
                      </section>
                    )}
                    {mediaLinks.length > 0 && (
                      <section>
                        <h4 className={pageStyles.mediaSection}>{t('mediaLinks')}</h4>
                        {mediaLinks.map((link, i) => (
                          <Fragment key={link.url}>
                            {i > 0 && <Divider seed={97 + i * 11} spacing={0} />}
                            <a className={pageStyles.mediaLinkRow} {...messageLinkProps(link, actions.openLink)}>
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
            <ConfirmModal
              open={!!linkToConfirm}
              title={t('linkConfirmTitle')}
              body={t('linkConfirmBody', { host: linkToConfirm?.host ?? '' })}
              cancelLabel={t('linkConfirmCancel')}
              confirmLabel={t('linkConfirmOpen')}
              onCancel={() => setLinkToConfirm(null)}
              onConfirm={() => {
                if (linkToConfirm) window.open(linkToConfirm.url, '_blank', 'noopener,noreferrer');
                setLinkToConfirm(null);
              }}
              seed={61}
            />

            <ConfirmModal
              open={confirmingDelete}
              title={t('deleteConfirmTitle')}
              body={t('deleteConfirmBody')}
              cancelLabel={t('deleteCancel')}
              confirmLabel={t('deleteConfirm')}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={confirmDelete}
              busy={deleting}
              destructive
              seed={59}
            />
            {safety.modals}
          </>
        )}
      </ThreadActionsContext.Provider>
    </CardEmbedSourceContext.Provider>
  );
}

/**
 * The small pill over the foot of the thread — the way back to the latest
 * message (`onClick`), or a word that something happened (copied): a
 * wobbly terracotta-light wash with no pen line.
 */
function Pill({ label, icon, onClick, className }: { label: string; icon?: 'chevron-down'; onClick?: () => void; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref);
  const body = (
    <>
      <HandDrawnBorder w={w} h={h} R={h / 2} seed={41} mag={1.2} segmentsH={2} segmentsV={1} curve={1.4} fillColor="var(--color-terracotta-light)" />
      {icon && <Icon name={icon} size={14} className={styles.pillGlyph} />}
      <span className={styles.pillLabel}>{label}</span>
    </>
  );
  const shared = {
    className: `${className ?? ''} res-shape-stand-in`,
    'data-shape-pending': w > 0 && h > 0 ? undefined : '',
    style: { '--shape-fill': 'var(--color-terracotta-light)', '--shape-radius': '999px' } as React.CSSProperties,
  };
  return onClick ? (
    <button ref={ref as React.RefObject<HTMLButtonElement>} type="button" onClick={onClick} {...shared}>
      {body}
    </button>
  ) : (
    <span ref={ref as React.RefObject<HTMLSpanElement>} role="status" {...shared}>
      {body}
    </span>
  );
}

/**
 * One shared card as a compact row in the「卡片與連結」list: organic thumb +
 * title, linking to the card page. Looked up in the thread's shared-card
 * previews, like an in-thread card — a card the viewer can no longer see
 * simply renders nothing.
 */
function SharedCardRow({ cardKey }: { cardKey: string }) {
  const data = useCardEmbed(`/card/${cardKey}`);
  if (data.status !== 'ready') return null;
  const { card } = data;
  return (
    <Link
      href={`/card/${card.slug ?? card.id}` as `/card/${string}`}
      className={pageStyles.mediaRow}
    >
      <span className={pageStyles.mediaThumb}>
        <OrganicImage src={card.media?.url} alt={card.thoughtCore} seed={7} ratio={1}>
          {!card.media?.url && (
            <span
              className={pageStyles.mediaThumbFallback}
              style={{ background: `oklch(90% 0.06 ${card.accentHue ?? 55})` }}
            />
          )}
        </OrganicImage>
      </span>
      <span className={pageStyles.mediaRowTitle}>{card.thoughtCore}</span>
    </Link>
  );
}
