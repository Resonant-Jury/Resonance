'use client';

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicMenu } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useCardEmbed } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { Link } from '@/i18n/navigation';
import { carriedOf, carriedWords, type Carried } from '@/lib/chat/carried';
import { messageCard } from '@/lib/chat/cardLink';
import { canReply, type ChatMessage } from '@/lib/chat/message';
import type { RunPosition } from '@/lib/chat/rows';
import type { TextRange } from '@/lib/chat/search';
import { seedFromId } from '@/lib/design/bubble';
import type { User } from '@/lib/db/types';
import { firstLinkOf, parseLink } from '@/lib/links/linkify';
import { BubbleWords, MessageBubble, type MessageLink } from './MessageBubble';
import { LinkPreviewPart, SharedCardPart, SharedCardSkeleton } from './BubbleParts';
import { ReplyQuote } from './ReplyQuote';
import { chooseMenuItem, messageMenuItems, useThreadActions } from './threadActions';
import styles from './Thread.module.css';

/** How long a finger rests on a message before its menu lifts it out. */
const LONG_PRESS_MS = 450;
/** How far a finger may wander and still be pressing (beyond it, it is scrolling). */
const PRESS_SLOP = 10;

export interface MessageCoreProps {
  message: ChatMessage;
  own: boolean;
  position: RunPosition;
  carried: Carried;
  /** A search's matches in its words, and whether it is the hit being looked at. */
  highlights?: readonly TextRange[];
  hitStrong?: boolean;
  flash?: boolean;
  /** False for the copy the long-press menu lifts: it shows the message, nothing in it answers. */
  interactive: boolean;
  /** The full time, as the bubble's tooltip. */
  title?: string;
  /** Beside the bubble (the hover actions), centred on it. */
  aside?: ReactNode;
}

/**
 * The message itself — the quote it answers and its bubble with everything
 * the bubble carries (its words, a link's preview, a shared card) — which a
 * long-press lifts out of the thread and draws again, without anything in it
 * answering.
 */
export function MessageCore({ message: m, own, position, carried, highlights, hitStrong = false, flash = false, interactive, title, aside }: MessageCoreProps) {
  const t = useTranslations('messages');
  const actions = useThreadActions();
  const onLink = interactive ? actions.openLink : null;
  const words = carriedWords(m, carried);
  const note = m.noteRef ? t('quotedNote') : undefined;
  const hasWords = !!words || !!note;
  // A preview whose address the link rules refuse shows nothing of itself.
  const previewLink = carried.kind === 'preview' ? parseLink(carried.preview.url) : null;
  const carries = carried.kind === 'card' || carried.kind === 'cardLoading' ? 'card' : previewLink ? 'preview' : undefined;

  return (
    <>
      {m.replyTo && (
        <ReplyQuote
          quote={m.replyTo}
          own={own}
          viewerId={actions.viewerId}
          otherHandle={actions.otherHandle}
          onJump={interactive ? actions.jumpTo : null}
        />
      )}
      <div className={styles.slot} data-over-quote={m.replyTo ? '' : undefined}>
        <MessageBubble
          seedKey={m.key}
          own={own}
          position={position}
          width={carries}
          plain={carried.kind === 'cardLoading'}
          flash={flash}
          // A hit in words the bubble doesn't show (the link standing for its card) marks the whole bubble.
          hitWhole={hitStrong && words !== m.text}
          overQuote={!!m.replyTo}
          title={title}
        >
          {hasWords && (
            <BubbleWords
              text={words}
              note={note}
              ranges={words === m.text ? highlights : undefined}
              strong={hitStrong}
              followed={!!carries}
              onLink={onLink}
            />
          )}
          {carried.kind === 'preview' && previewLink && (
            // Keyed by its picture: a picture that failed is tried again when the preview brings another.
            <LinkPreviewPart key={carried.preview.image ?? ''} preview={carried.preview} link={previewLink} afterWords={hasWords} onLink={onLink} />
          )}
          {carried.kind === 'card' && (
            <SharedCardPart key={carried.card.media?.url ?? ''} card={carried.card} author={carried.author} interactive={interactive} />
          )}
          {carried.kind === 'cardLoading' && <SharedCardSkeleton />}
        </MessageBubble>
        {aside}
      </div>
    </>
  );
}

/** What a message's bubble carries, from the card it is about (looked up in the thread's shared cards). */
export function useCarried(message: ChatMessage): Carried {
  const shared = useMemo(() => messageCard(message), [message]);
  const lookup = useCardEmbed(shared ? `/card/${shared.key}` : '');
  return carriedOf(message, shared, shared ? lookup : null);
}

export interface MessageRowProps {
  message: ChatMessage;
  own: boolean;
  position: RunPosition;
  /** The label that leads it: the day's, or the time after a pause. */
  label?: string;
  /** It stacks under the message before it (the tight gap). */
  joinsAbove: boolean;
  /** Their face stands beside it: the last of one of their runs. */
  face: User | null;
  /** The line under a message on its way or one that didn't go (not when the next of its run is on its way too). */
  deliveryLine: boolean;
  highlights?: readonly TextRange[];
  hitStrong?: boolean;
  flash?: boolean;
  /** The long-press menu has lifted it out: its place stays empty under the scrim. */
  lifted?: boolean;
  /** Its full time (the tooltip and the menu's footer). */
  fullTime: string;
}

/**
 * One message on its side of the thread (Messenger's layout): on theirs,
 * their face beside the last bubble of each run, and every one of their
 * bubbles indented by its column; the quote it answers, its bubble, and a
 * line if it is still on its way or didn't go. On a pointer device the reply
 * and「⋯」tools show beside the bubble on hover and keyboard focus; on a touch
 * screen, pressing and holding lifts it out with its menu.
 */
export const MessageRow = memo(function MessageRow({
  message: m,
  own,
  position,
  label,
  joinsAbove,
  face,
  deliveryLine,
  highlights,
  hitStrong,
  flash,
  lifted,
  fullTime,
}: MessageRowProps) {
  const t = useTranslations('messages');
  const tNative = useTranslations('native');
  const tSafety = useTranslations('safety');
  const actions = useThreadActions();
  const carried = useCarried(m);
  const [menuOpen, setMenuOpen] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  // The link the menus offer: the one under the finger, else the message's own — its preview's, or the first in its words.
  const link = useMemo<MessageLink | null>(
    () => (m.preview ? parseLink(m.preview.url) : null) ?? firstLinkOf(m.text),
    [m.preview, m.text],
  );
  const press = useLongPress(messageRef, (under) => {
    const el = messageRef.current;
    if (el) actions.press({ message: m, position, carried, rect: el.getBoundingClientRect(), link: under ?? link });
  });
  const items = useMemo(
    () =>
      messageMenuItems(
        m,
        link,
        {
          reply: t('reply'),
          copy: tNative('copy'),
          openLink: t('openLink'),
          copyLink: t('copyLink'),
          retry: t('retry'),
          discard: t('discardFailed'),
        },
        false,
      ),
    [m, link, t, tNative],
  );

  // A card the viewer can't see, shared alone: nothing to draw (not even their face beside it).
  if (carried.kind === 'nothing') return null;

  const aside = (
    <span className={styles.actions} data-own={own || undefined} data-open={menuOpen || undefined}>
      {canReply(m) && (
        <BareIconButton icon="reply" label={t('reply')} iconSize={18} seed={seedFromId(m.key, 29)} onClick={() => actions.reply(m)} />
      )}
      {items.length > 0 && (
        <OrganicMenu
          bare
          floating
          align={own ? 'end' : 'start'}
          label={tSafety('menuLabel')}
          seed={seedFromId(m.key, 23)}
          items={items}
          footer={fullTime}
          onOpenChange={setMenuOpen}
          onChoose={(key) => chooseMenuItem(key, m, link, actions)}
        />
      )}
    </span>
  );

  return (
    <div
      className={styles.row}
      data-own={own || undefined}
      data-message-id={m.id}
      data-message-key={m.key}
      data-run={position}
      data-gap={label ? 'label' : joinsAbove ? 'run' : 'runs'}
      data-delivery={m.delivery}
      data-flash={flash || undefined}
      data-lifted={lifted || undefined}
    >
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.line}>
        {!own && (
          <span className={styles.face}>
            {face && (
              <Link href={`/u/${face.handle}`} className={styles.faceLink} aria-label={t('viewProfile')} tabIndex={-1}>
                <HandDrawnAvatar
                  src={face.avatarUrl}
                  initials={face.initials}
                  size={28}
                  color={face.accentColor}
                  seed={Number(face.avatarSeed) || 3}
                />
              </Link>
            )}
          </span>
        )}
        <div className={styles.core}>
          <div ref={messageRef} className={styles.message} {...press}>
            <MessageCore
              message={m}
              own={own}
              position={position}
              carried={carried}
              highlights={highlights}
              hitStrong={hitStrong}
              flash={flash}
              interactive
              title={fullTime}
              aside={aside}
            />
          </div>
          {deliveryLine && <DeliveryLine message={m} />}
        </div>
      </div>
    </div>
  );
});

/** The line under a message of the viewer's own still on its way (after a second: a quick send says nothing), or one that didn't go. */
function DeliveryLine({ message }: { message: ChatMessage }) {
  const t = useTranslations('messages');
  const actions = useThreadActions();
  const [late, setLate] = useState(false);
  const sending = message.delivery === 'sending';
  useEffect(() => {
    if (!sending) return;
    const id = window.setTimeout(() => setLate(true), 1000);
    return () => window.clearTimeout(id);
  }, [sending]);
  if (message.delivery === 'failed') {
    return (
      <button type="button" className={styles.delivery} data-failed onClick={() => actions.retry(message.key)}>
        {t('sendFailed')}
      </button>
    );
  }
  return sending && late ? <span className={styles.delivery}>{t('sending')}</span> : null;
}

/**
 * Press-and-hold on a touch screen (a mouse never long-presses: it has the
 * hover tools): after {@link LONG_PRESS_MS} without wandering off, `onPress`
 * with the link under the finger, if any. The click that ends the press is
 * swallowed — a held link doesn't open — and so is the browser's own menu.
 */
function useLongPress(ref: React.RefObject<HTMLElement | null>, onPress: (link: MessageLink | null) => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' || e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const anchor = (e.target as HTMLElement).closest<HTMLElement>('[data-link-url]');
      const url = anchor?.dataset.linkUrl;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (!ref.current) return;
        fired.current = true;
        const link = url ? parseLink(url) : null;
        navigator.vibrate?.(8);
        onPressRef.current(link);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > PRESS_SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // A held finger asks the browser for its menu too: the message's own is the one that answers.
      if (fired.current || timer.current != null) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}
