'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Panel } from '@/components/molecules/Panel/Panel';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import styles from './FirstCardGuide.module.css';

const QUESTION_KEYS = ['q1', 'q2', 'q3'] as const;

export interface FirstCardGuideProps {
  /** Called with the chosen guiding question; the parent seeds it into the editor. */
  onPick: (question: string) => void;
}

/**
 * The guided first-card moment (ux §5): shown above the editor only while the
 * signed-in writer has no cards at all. Two-three guiding questions — picking
 * one drops it into the story as a quote to write against, and the guide steps
 * aside. Onboarding here is a writing companion, not a tour.
 */
export function FirstCardGuide({ onPick }: FirstCardGuideProps) {
  const t = useTranslations('write.firstCard');

  return (
    <Panel
      title={
        <>
          <Icon name="pen" size={16} color="var(--color-terracotta)" /> {t('title')}
        </>
      }
      variant="soft"
    >
      <p className={styles.intro}>{t('intro')}</p>
      {QUESTION_KEYS.map((key, i) => (
        <Fragment key={key}>
          <Divider seed={19 + i * 7} spacing={2} />
          <button type="button" className={styles.question} onClick={() => onPick(t(key))}>
            <span className={styles.mark} aria-hidden>
              ✎
            </span>
            {t(key)}
          </button>
        </Fragment>
      ))}
    </Panel>
  );
}
