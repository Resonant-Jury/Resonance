'use client';

import { useMemo, useRef, type AnchorHTMLAttributes, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { bubblePath, bubbleStandInRadius, seedFromId, type BubbleShapeOptions } from '@/lib/design/bubble';
import { markedSegments, type MarkedPiece } from '@/lib/chat/marks';
import type { TextRange } from '@/lib/chat/search';
import type { RunPosition } from '@/lib/chat/rows';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './Thread.module.css';

/** A link in a message as the thread opens it: its normalized address, its host, and whether to ask first. */
export interface MessageLink {
  url: string;
  host: string;
  suspicious: boolean;
}

/** What a click on a link in a thread does (null: nothing — the long-press copy only shows it). */
export type OnMessageLink = ((link: MessageLink, e: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => void) | null;

/**
 * The anchor props of a link in a thread: a new tab without the referrer or
 * an opener, the thread handling the click (a card of ours opens here) — or,
 * for an address easy to mistake for another (an IP, a punycode name), no
 * address the browser could open by itself: the thread asks first however
 * the reader opens it, and a middle click, a modifier or the browser's own
 * menu has nothing to open unasked. `undefined` for `onLink`: the browser's.
 */
export function messageLinkProps(link: MessageLink, onLink: OnMessageLink | undefined): AnchorHTMLAttributes<HTMLAnchorElement> & {
  'data-link-url': string;
} {
  const shows = onLink !== null;
  if (link.suspicious) {
    return {
      role: 'link',
      tabIndex: shows ? 0 : -1,
      'data-link-url': link.url,
      onClick: (e) => {
        e.preventDefault();
        onLink?.(link, e);
      },
      onKeyDown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onLink?.(link, e);
      },
    };
  }
  return {
    href: link.url,
    target: '_blank',
    rel: 'noopener noreferrer nofollow ugc',
    'data-link-url': link.url,
    tabIndex: shows ? undefined : -1,
    onClick: (e) => {
      if (onLink === null) e.preventDefault();
      else onLink?.(link, e);
    },
  };
}

/**
 * The wobbly outline an element of a bubble's family is cut to, once it is
 * measured: the clip-path it wears (empty before then, when it stands in as a
 * plain rounded box of the same corners).
 */
export function useBubbleClip(ref: React.RefObject<HTMLElement | null>, seed: number, opts: BubbleShapeOptions, enabled = true): string {
  const { w, h } = useElementSize(ref);
  const { own, run, maxRadius } = opts;
  return useMemo(
    () => (enabled && w > 0 && h > 0 ? `path('${bubblePath(w, h, seed, { own, run, maxRadius })}')` : ''),
    [enabled, w, h, seed, own, run, maxRadius],
  );
}

export interface MessageBubbleProps {
  /** The message's key: its wobble's seed (so it keeps its shape from sending to sent). */
  seedKey: string;
  own: boolean;
  position?: RunPosition;
  /** It carries a link's preview (280 px wide) or a shared card (300): one bubble of a fixed width. */
  width?: 'preview' | 'card';
  /** Its plain stand-in (a rounded box, nothing measured) — while the card it carries is read. */
  plain?: boolean;
  /** Washes terracotta for a moment: the message a reply's quote jumped to. */
  flash?: boolean;
  /** A search hit in words the bubble doesn't show (the link that stands for its card): the whole bubble is marked. */
  hitWhole?: boolean;
  /** It answers a quote, and lies over that quote's foot. */
  overQuote?: boolean;
  title?: string;
  children: ReactNode;
}

/**
 * One message's bubble — Messenger's flat bubble in our hand: a filled wobble
 * with no pen line (the viewer's own on `--bubble-mine`, theirs on
 * `--bubble-theirs`), cut to its own outline so a picture inside runs edge to
 * edge and ends where the bubble does. In a run of one person's messages the
 * corners facing its neighbours tuck, on the sender's side (lib/design/bubble
 * — the recipe the apps draw with too). Until it is measured it stands in as
 * a plain rounded box of the same fill and corners.
 */
export function MessageBubble({
  seedKey,
  own,
  position = 'single',
  width,
  plain = false,
  flash = false,
  hitWhole = false,
  overQuote = false,
  title,
  children,
}: MessageBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opts = { own, run: position };
  const clip = useBubbleClip(ref, seedFromId(seedKey), opts, !plain);
  const style: CSSProperties = clip ? { clipPath: clip } : { borderRadius: bubbleStandInRadius(opts) };
  return (
    <div
      ref={ref}
      className={styles.bubble}
      style={style}
      title={title}
      data-own={own || undefined}
      data-width={width}
      data-shaped={clip ? '' : undefined}
      data-flash={flash || undefined}
      data-hit-whole={hitWhole || undefined}
      data-over-quote={overQuote || undefined}
    >
      {children}
    </div>
  );
}

export interface BubbleWordsProps {
  text: string;
  /** The italic line over a reply to a note (「回覆你的紙條」). */
  note?: string;
  /** Where a search matched (offsets into `text`); `strong` for the hit being looked at. */
  ranges?: readonly TextRange[];
  strong?: boolean;
  /** Something follows the words inside the bubble (a preview, a card): it brings its own air above it. */
  followed?: boolean;
  /** A link was clicked; null when the bubble is only a picture of itself (the long-press copy). */
  onLink?: OnMessageLink;
}

const marks = (pieces: MarkedPiece[], strong: boolean) =>
  pieces.map((p, i) =>
    p.marked ? (
      <mark key={i} className={styles.mark} data-strong={strong || undefined}>
        {p.text}
      </mark>
    ) : (
      p.text
    ),
  );

/**
 * A bubble's words, with their http(s) links made links. The anchors are
 * built only from addresses linkify accepted (the server's link rules), never
 * from the raw text ({@link messageLinkProps}). A search's matches are marked.
 */
export function BubbleWords({ text, note, ranges, strong = false, followed = false, onLink }: BubbleWordsProps) {
  const segments = useMemo(() => markedSegments(text, ranges), [text, ranges]);
  return (
    <div className={styles.words} data-followed={followed || undefined}>
      {note && (
        <span className={styles.noteLabel}>
          <Icon name="note" size={13} />
          {note}
        </span>
      )}
      {text &&
        segments.map((seg, i) =>
          seg.type === 'text' ? (
            <span key={i}>{marks(seg.pieces, strong)}</span>
          ) : (
            <a key={i} className={styles.link} {...messageLinkProps({ url: seg.url, host: seg.host, suspicious: seg.suspicious }, onLink)}>
              {marks(seg.pieces, strong)}
            </a>
          ),
        )}
    </div>
  );
}
