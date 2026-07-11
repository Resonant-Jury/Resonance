'use client';

import { useRef, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';

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
}

/**
 * One hand-drawn speech bubble. Measures itself (same pattern as the editor's
 * ToolButton) and wraps the text in a wobbly filled shape: the viewer's own
 * messages wash terracotta-light, the other voice sits on cream. An optional
 * quote header marks a message that replies to a note.
 */
export function MessageBubble({ id, text, own, title, quoteLabel }: MessageBubbleProps) {
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
        padding: '10px 16px',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        lineHeight: 1.65,
        color: 'var(--color-text)',
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
            own
              ? 'color-mix(in oklch, var(--color-terracotta-light) 62%, transparent)'
              : 'var(--color-cream)'
          }
          strokeColor={own ? 'transparent' : 'var(--field-border)'}
          strokeWidth={own ? 0 : 1.1}
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
      <span style={{ position: 'relative', display: 'block' }}>{text}</span>
    </div>
  );
}
