'use client';

import { useRef } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
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
}

/**
 * One hand-drawn speech bubble. Measures itself (same pattern as the editor's
 * ToolButton) and wraps the text in a wobbly filled shape: the viewer's own
 * messages wash terracotta-light, the other voice sits on cream.
 */
export function MessageBubble({ id, text, own, title }: MessageBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const seed = seedFromId(id);

  return (
    <div
      ref={ref}
      title={title}
      style={{
        position: 'relative',
        maxWidth: '72%',
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
          segmentsH={[2, 4]}
          segmentsV={1}
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
      <span style={{ position: 'relative' }}>{text}</span>
    </div>
  );
}
