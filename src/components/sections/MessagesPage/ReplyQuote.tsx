'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { QUOTE_RADIUS, bubbleStandInRadius, seedFromId } from '@/lib/design/bubble';
import type { MessageReplyQuote } from '@/lib/db/types';
import { useBubbleClip } from './MessageBubble';
import styles from './Thread.module.css';

export interface ReplyQuoteProps {
  quote: MessageReplyQuote;
  /** The reply itself is the viewer's. */
  own: boolean;
  viewerId: string;
  otherHandle: string;
  /** A click goes to the original (null: the long-press copy, which only shows it). */
  onJump: ((messageId: string) => void) | null;
}

/**
 * What a reply answers, over it (Messenger's): the quoted words as a quieter
 * bubble of their own (`--bubble-quote`, two lines at most) whose foot the
 * reply's bubble lies over. A card-only original reads「一張卡片」. A click
 * goes to the original, reading older pages for it when it isn't loaded.
 *
 * Who answered whom goes without saying in a one-to-one thread (the reply
 * stands on its sender's side), so it is not shown — only read out, before
 * the quote, as it always was (「{handle} 回覆了你」, …).
 */
export function ReplyQuote({ quote, own, viewerId, otherHandle, onJump }: ReplyQuoteProps) {
  const t = useTranslations('messages');
  const quotesViewer = quote.senderId === viewerId;
  const caption = own
    ? quotesViewer
      ? t('youRepliedToYourself')
      : t('youRepliedTo', { handle: otherHandle })
    : quotesViewer
      ? t('repliedToYou', { handle: otherHandle })
      : t('repliedToThemselves', { handle: otherHandle });
  const words = quote.text || t('replyCard');
  const ref = useRef<HTMLButtonElement>(null);
  const clip = useBubbleClip(ref, seedFromId(quote.id, 19), { maxRadius: QUOTE_RADIUS });

  return (
    <div className={styles.quote} data-own={own || undefined}>
      <span className={styles.quoteSpoken}>{caption}</span>
      <button
        ref={ref}
        type="button"
        className={styles.quoteBubble}
        style={clip ? { clipPath: clip } : { borderRadius: bubbleStandInRadius({ maxRadius: QUOTE_RADIUS }) }}
        data-shaped={clip ? '' : undefined}
        aria-label={words}
        tabIndex={onJump ? undefined : -1}
        onClick={() => onJump?.(quote.id)}
      >
        <span className={styles.quoteText}>{words}</span>
      </button>
    </div>
  );
}
