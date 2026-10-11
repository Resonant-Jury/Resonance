import { useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import styles from './StorytellerProof.module.css';

const AVATARS: { ini: string; color: string }[] = [
  { ini: '念', color: 'var(--color-terracotta-light)' },
  { ini: '蕭', color: 'var(--color-lavender)' },
  { ini: '方', color: 'var(--color-sage)' },
  { ini: 'TE', color: 'var(--color-yellow)' },
];

/**
 * A few storytellers' hand-drawn faces and the line beside them (成為一群最早
 * 說故事的人): the landing hero's foot, and the sign-in pages' cover.
 */
export function StorytellerProof({ className }: { className?: string }) {
  const t = useTranslations('hero');
  return (
    <div className={[styles.proof, className].filter(Boolean).join(' ')}>
      <div className={styles.avatarStack} aria-hidden>
        {/* Overlapping by 6px: each one's initials stay whole beside the next (10px cut into them). */}
        {AVATARS.map((a, i) => (
          <div key={a.ini} style={{ marginLeft: i > 0 ? -6 : 0 }}>
            <HandDrawnAvatar initials={a.ini} size={30} seed={i * 55 + 3} color={a.color} />
          </div>
        ))}
      </div>
      <span className={styles.text}>{t('proof')}</span>
    </div>
  );
}
