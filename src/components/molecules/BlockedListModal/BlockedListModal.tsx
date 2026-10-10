'use client';

import { Fragment, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Divider } from '@/components/atoms/Divider/Divider';
import { useAuth } from '@/components/providers/AuthProvider';
import { listMyBlocks, unblockUser } from '@/lib/db/firestore/client/blocks';
import { getUsersByIds } from '@/lib/db/firestore/client/reads';
import { EmptyState } from '@/components/molecules/EmptyState/EmptyState';
import styles from './BlockedListModal.module.css';

export interface BlockedListModalProps {
  open: boolean;
  onClose: () => void;
}

/** 管理封鎖名單 — everyone the viewer blocked, newest first, each unblockable. */
export function BlockedListModal({ open, onClose }: BlockedListModalProps) {
  const t = useTranslations('safety.blockedList');
  const tSafety = useTranslations('safety');
  const locale = useLocale();
  const { user } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();
  const [pending, setPending] = useState<string | null>(null);

  const { data, mutate } = useSWR(open && user ? `blocklist:${user.id}` : null, async () => {
    const blocks = await listMyBlocks();
    const people = await getUsersByIds(blocks.map((b) => b.uid));
    return blocks.map((b) => ({ ...b, user: people[b.uid] }));
  });

  async function unblock(uid: string) {
    if (pending) return;
    setPending(uid);
    try {
      await unblockUser(uid);
      await mutate();
      void globalMutate(() => true);
    } finally {
      setPending(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={440}
      seed={97}
      ariaLabel={t('title')}
      // A list with nothing to do at its foot: the close lies there.
      closeButton
      closeLabel={t('close')}
    >
      <h3 className={styles.title}>{t('title')}</h3>
      <p className={styles.subtitle}>{t('subtitle')}</p>
      {data && data.length === 0 && <EmptyState icon="ban" seed={61} line={t('empty')} />}
      {data && data.length > 0 && (
        <ul className={styles.list}>
          {data.map((row, i) => (
            <Fragment key={row.uid}>
              {i > 0 && <Divider seed={100 + i * 7} spacing={2} />}
              <li className={styles.row}>
                <HandDrawnAvatar
                  src={row.user?.avatarUrl}
                  initials={row.user?.initials ?? '··'}
                  size={36}
                  color={row.user?.accentColor ?? 'var(--color-cream-dark)'}
                  seed={Number(row.user?.avatarSeed) || 5}
                />
                <span className={styles.who}>
                  <span className={styles.handle}>{row.user?.handle ?? t('unknownUser')}</span>
                  {row.createdAt && (
                    <span className={styles.since}>
                      {t('since', {
                        date: row.createdAt.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }),
                      })}
                    </span>
                  )}
                </span>
                <span>
                  {/* One at a time: the row on its way shows the loader, the others rest. */}
                  <OrganicButton
                    variant="textAccent"
                    size="sm"
                    onClick={() => void unblock(row.uid)}
                    loading={pending === row.uid}
                    disabled={pending != null && pending !== row.uid}
                  >
                    {tSafety('unblock')}
                  </OrganicButton>
                </span>
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </Modal>
  );
}
