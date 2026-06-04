'use client';

import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import styles from './AvatarGroup.module.css';

export interface AvatarGroupMember {
  id: string;
  initials: string;
  accentColor: string;
  avatarSeed: string;
}

export interface AvatarGroupProps {
  members: AvatarGroupMember[];
  /** How many avatars to render before collapsing the rest into a +N chip. */
  max?: number;
  size?: number;
  /** Total count, when the caller knows more members exist than were passed in. */
  total?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * Overlapping stack of hand-drawn avatars (the "avatar group" pattern). The
 * whole stack is an optional button; a `+N` chip caps the overflow. Reuses
 * `HandDrawnAvatar` so the organic profile aesthetic carries through.
 */
export function AvatarGroup({
  members,
  max = 3,
  size = 38,
  total,
  onClick,
  ariaLabel,
}: AvatarGroupProps) {
  const shown = members.slice(0, max);
  const count = total ?? members.length;
  const overflow = count - shown.length;

  const inner = (
    <span className={styles.stack} style={{ ['--avatar-size' as string]: `${size}px` }}>
      {shown.map((m, i) => (
        <span key={m.id} className={styles.item} style={{ zIndex: shown.length - i }}>
          <HandDrawnAvatar
            initials={m.initials}
            size={size}
            color={m.accentColor}
            seed={Number(m.avatarSeed) || i + 1}
          />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={styles.more}
          style={{ width: size, height: size, zIndex: 0 }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );

  if (!onClick) return inner;

  return (
    <button type="button" className={styles.button} onClick={onClick} aria-label={ariaLabel}>
      {inner}
    </button>
  );
}
