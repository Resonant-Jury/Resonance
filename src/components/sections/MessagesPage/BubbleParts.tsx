'use client';

import { Icon } from '@/components/atoms/Icon';
import { useImageRetry } from '@/lib/hooks/useImageRetry';
import type { MessageLinkPreview } from '@/lib/db/types';
import { messageLinkProps, type MessageLink, type OnMessageLink } from './MessageBubble';
import styles from './Thread.module.css';

export interface LinkPreviewPartProps {
  preview: MessageLinkPreview;
  /** The preview's address, as the link rules normalized it. */
  link: MessageLink;
  /** The message's words are above it: the picture keeps a step from them (without them it starts at the bubble's top edge). */
  afterWords: boolean;
  /** A click on it; null for the long-press copy, which only shows it. */
  onLink: OnMessageLink;
}

/**
 * A link's unfurled page inside its message's bubble (Messenger's): after the
 * words, the page's picture edge to edge at 1.91:1 — when it has one and it
 * loads; one that won't takes its section with it, and is asked for once
 * more a little later (`useImageRetry`) — then the title, a line
 * of description and the host with the link glyph. The host is the real one
 * the click leads to, in ASCII (punycode for an international name); the
 * picture only ever comes from our own `/api/link-image` route (the server
 * fetched it, never this browser).
 */
export function LinkPreviewPart({ preview, link, afterWords, onLink }: LinkPreviewPartProps) {
  const picture = useImageRetry(preview.image);
  const host = link.host.replace(/^www\./, '');
  return (
    <a className={styles.previewPart} {...messageLinkProps(link, onLink)}>
      {preview.image && !picture.hidden && (
        <span className={styles.picture} data-after-words={afterWords || undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={picture.attempt}
            src={preview.image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={picture.onError}
          />
        </span>
      )}
      <span className={styles.previewBody}>
        <span className={styles.previewTitle}>{preview.title}</span>
        {preview.description && <span className={styles.previewDescription}>{preview.description}</span>}
        <span className={styles.previewHost}>
          <Icon name="link" size={12} />
          <span className={styles.ellipsis}>{host}</span>
        </span>
      </span>
    </a>
  );
}
