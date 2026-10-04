'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import styles from './AppHeader.module.css';

/**
 * Header entry to the writer: the pen beside the messages and the bell — at
 * every width the signed-in reader's way to start a card (the feed's end and
 * the card pages carry none of their own).
 */
export function WriteEntry() {
  const t = useTranslations('app.nav');
  return (
    <Link href="/write" aria-label={t('write')} title={t('write')} className={styles.entry}>
      <Icon name="pen" size={22} />
    </Link>
  );
}
