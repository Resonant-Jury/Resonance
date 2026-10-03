'use client';

import { useRef, useState } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { seedFromString } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import type { MessageLinkPreview } from '@/lib/db/types';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { parseLink } from '@/lib/links/linkify';
import styles from './MessagesPage.module.css';

export interface LinkPreviewCardProps {
  preview: MessageLinkPreview;
  onConfirmLink?: (link: { url: string; host: string }) => void;
}

/**
 * The first link of a message as a card under its bubble: picture (when the
 * page had one), title, a line of description and the site's host. The
 * address is run through the same checks as a link in the text — if it fails
 * them nothing is shown — and its host is always the real one, in ASCII
 * (punycode for international names). The picture comes only from our own
 * `/api/link-image` route (the server fetched it, never this browser).
 */
export function LinkPreviewCard({ preview, onConfirmLink }: LinkPreviewCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { w, h } = useElementSize(ref);
  // A picture that fails to load leaves no empty frame behind.
  const [imageFailed, setImageFailed] = useState(false);
  const link = parseLink(preview.url);
  if (!link) return null;
  const seed = seedFromString(preview.url);
  const host = link.host.replace(/^www\./, '');

  return (
    <a
      ref={ref}
      className={styles.previewCard}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => {
        if (!link.suspicious || !onConfirmLink) return;
        e.preventDefault();
        onConfirmLink({ url: link.url, host: link.host });
      }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={16}
        seed={seed}
        fillColor="var(--color-cream)"
        strokeColor="var(--field-border)"
        strokeWidth={INK}
      />
      {preview.image && !imageFailed && (
        <span className={styles.previewImage}>
          <OrganicImage seed={seed + 3} R={12} ratio={1 / 1.91}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.image}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </OrganicImage>
        </span>
      )}
      <span className={styles.previewText}>
        <span className={styles.previewTitle}>{preview.title}</span>
        {preview.description && <span className={styles.previewDescription}>{preview.description}</span>}
        <span className={styles.previewHost}>
          <Icon name="link" size={11} />
          {host}
        </span>
      </span>
    </a>
  );
}
