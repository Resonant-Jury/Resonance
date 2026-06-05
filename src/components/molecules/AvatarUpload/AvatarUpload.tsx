'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  HandDrawnAvatar,
  avatarWobPath,
} from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { Icon } from '@/components/atoms/Icon';
import styles from './AvatarUpload.module.css';

export interface AvatarUploadProps {
  /** current avatar image URL (if any) */
  src?: string;
  /** initials fallback shown when no image is set */
  initials: string;
  accentColor?: string;
  size?: number;
  seed?: number;
  /** called with the public R2 URL once an upload succeeds */
  onUploaded: (url: string) => void;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * A large, click- or drag-to-upload avatar block for the profile editor. The
 * avatar itself is the dropzone: hovering reveals a "change" overlay, dragging
 * highlights it, and an upload swaps in a SketchLoader until the new picture is
 * stored. Reuses the same /api/upload → R2 proxy as the card image upload.
 */
export function AvatarUpload({
  src,
  initials,
  accentColor,
  size = 120,
  seed = 77,
  onUploaded,
}: AvatarUploadProps) {
  const t = useTranslations('settings.profile');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clip the hover/upload wash to the avatar's exact wobbly outline so the dark
  // overlay follows the hand-drawn curve instead of leaking past it.
  const clipPath = useMemo(
    () => `path('${avatarWobPath(size, seed)}')`,
    [size, seed]
  );

  async function upload(file: File) {
    if (uploading) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) {
        setError(t('avatarError'));
        return;
      }
      const { publicUrl } = (await res.json()) as { publicUrl: string };
      onUploaded(publicUrl);
    } catch {
      setError(t('avatarError'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.dropzone}
        style={{ width: size, height: size }}
        data-drag={dragOver || undefined}
        disabled={uploading}
        aria-label={t('avatarChange')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <HandDrawnAvatar
          src={src}
          initials={initials}
          color={accentColor}
          size={size}
          seed={seed}
        />
        <span
          className={styles.overlay}
          style={{ clipPath, WebkitClipPath: clipPath }}
          aria-hidden="true"
        >
          {uploading ? (
            <SketchLoader size={size * 0.5} seed={seed} ariaLabel={t('avatarUploading')} />
          ) : (
            <Icon name="image" size={26} color="var(--color-cream)" />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className={styles.fileInputHidden}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
          e.currentTarget.value = '';
        }}
      />

      <div className={styles.meta}>
        <span className={styles.label}>{t('avatar')}</span>
        <span className={styles.hint}>
          {uploading ? t('avatarUploading') : t('avatarHint')}
        </span>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
