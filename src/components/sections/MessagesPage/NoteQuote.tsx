'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import type { Carried } from '@/lib/chat/carried';
import { QUOTE_RADIUS, bubbleStandInRadius, seedFromId } from '@/lib/design/bubble';
import { useBubbleClip } from './MessageBubble';
import { SharedCardPart, SharedCardSkeleton } from './BubbleParts';
import styles from './Thread.module.css';

export interface NoteQuoteProps {
  /** The note message's key: the quote's wobble seed. */
  seedKey: string;
  /** The viewer left the note (on the other's card); else it was left on the viewer's. */
  own: boolean;
  otherHandle: string;
  /** The card the note was left on, as the thread has it: read, still being read, or not the viewer's to see. */
  carried: Carried;
  /** False for the long-press copy, which only shows it. */
  interactive: boolean;
}

/**
 * What a note (小紙條) answers, over its words — the card it was left on, the
 * way a reply's quote sits over a reply: a caption with the note glyph
 * (「{handle} 用小紙條回覆了你的卡片」, or that the viewer left one), then the
 * card as the shared post a thread draws, on the quieter quote fill at a
 * card's width, whose foot the note's own bubble lies over. A click opens the
 * card. While the card is read it is the shared card's plain stand-in; a card
 * the viewer can no longer see is the plain quote「一張卡片」.
 */
export function NoteQuote({ seedKey, own, otherHandle, carried, interactive }: NoteQuoteProps) {
  const t = useTranslations('messages');
  const caption = own ? t('youLeftNote', { handle: otherHandle }) : t('noteOnYourCard', { handle: otherHandle });
  const card = carried.kind === 'card' || carried.kind === 'cardLoading';
  const ref = useRef<HTMLDivElement>(null);
  const shape = { maxRadius: QUOTE_RADIUS };
  // A card being read stands in plain (nothing measured), as a card's bubble does.
  const clip = useBubbleClip(ref, seedFromId(seedKey, 19), shape, carried.kind !== 'cardLoading');

  return (
    <div className={styles.quote} data-own={own || undefined} data-note="">
      <span className={styles.quoteCaption}>
        <Icon name="note" size={12} />
        {caption}
      </span>
      {card ? (
        <div
          ref={ref}
          className={styles.bubble}
          data-tone="quote"
          data-width="card"
          data-shaped={clip ? '' : undefined}
          style={clip ? { clipPath: clip } : { borderRadius: bubbleStandInRadius(shape) }}
        >
          {carried.kind === 'card' ? (
            <SharedCardPart key={carried.card.media?.url ?? ''} card={carried.card} author={carried.author} interactive={interactive} />
          ) : (
            <SharedCardSkeleton />
          )}
          {/* The note's bubble lies over this. */}
          <span className={styles.quoteFoot} aria-hidden />
        </div>
      ) : (
        <div
          ref={ref}
          className={styles.quoteBubble}
          data-plain=""
          data-shaped={clip ? '' : undefined}
          style={clip ? { clipPath: clip } : { borderRadius: bubbleStandInRadius(shape) }}
        >
          <span className={styles.quoteText}>{t('replyCard')}</span>
        </div>
      )}
    </div>
  );
}
