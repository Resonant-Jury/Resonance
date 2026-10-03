'use client';

import { useRef, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { linkify } from '@/lib/links/linkify';
import styles from './MessagesPage.module.css';

/** Deterministic per-message wobble seed from the Firestore doc id. */
function seedFromId(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 9973) + 1;
}

export interface MessageBubbleProps {
  id: string;
  text: string;
  own: boolean;
  /** Full timestamp, surfaced as a tooltip. */
  title?: string;
  /** A「回覆你的紙條」quote header rendered above the text (note-reply). */
  quoteLabel?: ReactNode;
  /**
   * The faded quote of the message a reply answers: smaller, muted, two lines
   * at most, and its links stay plain text.
   */
  ghost?: boolean;
  /** Called instead of following a link whose host is easy to mistake (IP address, punycode). */
  onConfirmLink?: (link: { url: string; host: string }) => void;
}

/**
 * The message's words with their http(s) links made tappable. The anchors are
 * built only from addresses `linkify` accepted (its rules match the server's
 * link previews), never from the raw text, and open a new tab without the
 * referrer or an opener.
 */
function LinkedText({
  text,
  onConfirmLink,
}: {
  text: string;
  onConfirmLink?: MessageBubbleProps['onConfirmLink'];
}) {
  return (
    <>
      {linkify(text).map((seg, i) =>
        seg.type === 'text' ? (
          seg.text
        ) : (
          <a
            key={i}
            className={styles.messageLink}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            onClick={(e) => {
              if (!seg.suspicious || !onConfirmLink) return;
              e.preventDefault();
              onConfirmLink({ url: seg.url, host: seg.host });
            }}
          >
            {seg.text}
          </a>
        ),
      )}
    </>
  );
}

/**
 * One hand-drawn speech bubble. Measures itself (same pattern as the editor's
 * ToolButton) and wraps the text in a wobbly filled shape: the viewer's own
 * messages wash terracotta-light, the other voice sits on cream. An optional
 * quote header marks a message that replies to a note.
 */
export function MessageBubble({ id, text, own, title, quoteLabel, ghost, onConfirmLink }: MessageBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const seed = seedFromId(id);
  // Turning points scale with each edge so a tall multi-line bubble gets more
  // wobble along its sides and a wide one along its top/bottom — a fixed
  // count reads mechanical at one aspect ratio and noisy at the other.
  const segmentsH = Math.max(2, Math.min(6, Math.round(w / 80)));
  const segmentsV = Math.max(1, Math.min(8, Math.round(h / 52)));

  return (
    <div
      ref={ref}
      title={title}
      style={{
        position: 'relative',
        // Width is capped by the parent .messageStack (72% of the row) — a
        // percentage max-width here would resolve against the shrink-to-fit
        // stack and collapse the bubble to its minimum content width.
        padding: ghost ? '7px 14px' : '10px 16px',
        fontFamily: 'var(--font-body)',
        fontSize: ghost ? 13 : 14,
        lineHeight: 1.65,
        color: ghost ? 'var(--color-text-muted)' : 'var(--color-text)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
      }}
    >
      {w > 0 && h > 0 && (
        <HandDrawnBorder
          w={w}
          h={h}
          R={Math.min(16, h * 0.42)}
          seed={seed}
          mag={Math.min(2.6, h * 0.05)}
          segmentsH={segmentsH}
          segmentsV={segmentsV}
          curve={1.3}
          cornerJitter={1.6}
          cornerOffset={Math.min(w, h) * 0.04}
          fillColor={
            ghost
              ? 'color-mix(in oklch, var(--color-cream) 55%, transparent)'
              : own
              ? 'color-mix(in oklch, var(--color-terracotta-light) 62%, transparent)'
              : 'var(--color-cream)'
          }
          strokeColor={
            ghost
              ? 'color-mix(in oklch, var(--field-border) 55%, transparent)'
              : own
                ? 'transparent'
                : 'var(--field-border)'
          }
          strokeWidth={own && !ghost ? 0 : 1.1}
        />
      )}
      {quoteLabel && (
        <span
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginBottom: 5,
            fontSize: 12,
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          <Icon name="note" size={13} />
          {quoteLabel}
        </span>
      )}
      <span className={ghost ? styles.ghostText : undefined} style={{ position: 'relative', display: 'block' }}>
        {ghost ? text : <LinkedText text={text} onConfirmLink={onConfirmLink} />}
      </span>
    </div>
  );
}
