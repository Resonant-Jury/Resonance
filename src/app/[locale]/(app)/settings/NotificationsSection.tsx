'use client';

import { Fragment, useId } from 'react';
import { useTranslations } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { useNotificationSettings, type NotificationSwitch } from '@/lib/data/notificationSettings';
import styles from './NotificationsSection.module.css';

const SWITCHES: { name: NotificationSwitch; label: 'picks' | 'connectionCards'; hint: 'picksHint' | 'connectionCardsHint'; seed: number }[] = [
  { name: 'picks', label: 'picks', hint: 'picksHint', seed: 83 },
  { name: 'connectionCards', label: 'connectionCards', hint: 'connectionCardsHint', seed: 89 },
];

/**
 * Settings → 通知: the pushes beyond the ones answering you, each its own
 * switch, both off until turned on. They reach the person's phones (the
 * apps); the web only keeps the choice — which the line above the switches
 * says, for someone who reads Resonance on the web alone (each switch is
 * described by it too). A flip shows at once and is undone, with a line
 * saying so, when it doesn't save.
 */
export function NotificationsSection() {
  const t = useTranslations('settings.notifications');
  const tNative = useTranslations('native');
  const { data, loadFailed, saveFailed, set } = useNotificationSettings();
  const id = useId();

  return (
    <div className={styles.section}>
      <p id={`${id}-apps`} className={styles.note}>
        {t('appsOnly')}
      </p>
      {SWITCHES.map(({ name, label, hint, seed }, i) => (
        <Fragment key={name}>
          {i > 0 && <Divider seed={seed + 2} spacing={2} />}
          <div className={styles.row}>
            <div className={styles.text}>
              <span className={styles.label}>{t(label)}</span>
              <p id={`${id}-${name}`} className={styles.hint}>
                {t(hint)}
              </p>
            </div>
            <div className={styles.switch}>
              <ToggleSwitch
                checked={data?.[name] ?? false}
                disabled={!data}
                onChange={() => data && void set(name, !data[name])}
                ariaLabel={t(label)}
                describedBy={`${id}-${name} ${id}-apps`}
                seed={seed}
              />
            </div>
          </div>
        </Fragment>
      ))}
      {(saveFailed || loadFailed) && (
        <p role="alert" className={styles.error}>
          {saveFailed ? t('saveError') : tNative('loadError')}
        </p>
      )}
    </div>
  );
}
