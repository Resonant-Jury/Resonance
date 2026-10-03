'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import type { MessageReplyQuote } from '@/lib/db/types';
import { MessageBubble } from './MessageBubble';
import styles from './MessagesPage.module.css';

export interface ReplyQuoteProps {
  quote: MessageReplyQuote;
  /** The reply itself is the viewer's. */
  own: boolean;
  viewerId: string;
  otherHandle: string;
  /** The quoted message is among the loaded ones, so tapping can scroll to it. */
  canJump: boolean;
  onJump: (messageId: string) => void;
}

/**
 * What a reply answers, above its bubble: a small caption (who replied to
 * whom) and the quoted words as a faded, two-line ghost of a bubble that the
 * reply bubble slightly overlaps. A card-only original reads「一張卡片」.
 * Tapping it scrolls to the original when it is loaded.
 */
export function ReplyQuote({ quote, own, viewerId, otherHandle, canJump, onJump }: ReplyQuoteProps) {
  const t = useTranslations('messages');
  const quotesViewer = quote.senderId === viewerId;
  const caption = own
    ? quotesViewer
      ? t('youRepliedToYourself')
      : t('youRepliedTo', { handle: otherHandle })
    : quotesViewer
      ? t('repliedToYou', { handle: otherHandle })
      : t('repliedToThemselves', { handle: otherHandle });
  const words = quote.text || (quote.cardRef ? t('replyCard') : '');

  return (
    <div className={styles.replyQuote} data-own={own || undefined}>
      <span className={styles.replyCaption}>
        <Icon name="reply" size={12} />
        {caption}
      </span>
      {words && (
        <button
          type="button"
          className={styles.replyGhost}
          data-own={own || undefined}
          data-jumpable={canJump || undefined}
          aria-label={words}
          onClick={() => canJump && onJump(quote.id)}
        >
          <MessageBubble id={`q-${quote.id}`} text={words} own={own} ghost />
        </button>
      )}
    </div>
  );
}
