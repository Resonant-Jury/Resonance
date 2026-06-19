'use client';

import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
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
  return (
    <div className={styles.page}>
      <div className={styles.board}>
        <ThoughtMapBoard height="100%" flush />
      </div>
      <div className={styles.back}>
        <Link href="/me" style={{ textDecoration: 'none' }}>
          <OrganicButton variant="outline">
            <span className={styles.backIcon}>
              <Icon name="arrow-right" size={16} />
            </span>
            {t('thoughtMap.back')}
          </OrganicButton>
        </Link>
      </div>
    </div>
  );
}
