'use client';

import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { Link } from '@/i18n/navigation';
import styles from './ThoughtMapPage.module.css';

/**
 * Full-screen, Miro-style thought-map editor. The dotted ground bleeds to the
 * viewport edges and a single Back control returns to the profile — the work
 * here is involved enough to deserve a page of its own rather than an inline
 * panel under the card box.
 */
export function ThoughtMapPage() {
  const t = useTranslations('me');
  // Phones keep just the arrow — the label would crowd the board's toolbar row.
  const isMobile = useIsMobile(640);
  return (
    <div className={styles.page}>
      <div className={styles.board}>
        <ThoughtMapBoard height="100%" flush />
      </div>
      <div className={styles.back}>
        <Link href="/me" style={{ textDecoration: 'none' }} title={t('thoughtMap.back')}>
          <OrganicButton variant="outline" size="sm">
            <span className={styles.backIcon}>
              <Icon name="arrow-right" size={15} ariaLabel={isMobile ? t('thoughtMap.back') : undefined} />
            </span>
            {!isMobile && t('thoughtMap.back')}
          </OrganicButton>
        </Link>
      </div>
    </div>
  );
}
