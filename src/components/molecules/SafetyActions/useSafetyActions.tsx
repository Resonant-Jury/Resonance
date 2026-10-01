'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import type { OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import type { ReportTarget } from '@/components/molecules/ReportModal/ReportModal';
import { blockUser, unblockUser } from '@/lib/db/firestore/client/blocks';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';

// Loaded the first time someone reports, not with every page that has a ⋯.
const ReportModal = dynamic(() => import('@/components/molecules/ReportModal/ReportModal').then((m) => m.ReportModal));

export interface SafetyActionsOptions {
  /** What a report files against (card / user / message). */
  report: ReportTarget;
  /** Whether the viewer currently blocks `report.userId`. */
  isBlocked?: boolean;
  /** After a block or unblock went through. */
  onBlockedChange?: (blocked: boolean) => void;
}

export interface SafetyActions {
  /** Menu rows to merge into a host「⋯」menu (keys are `safety:*`). */
  items: OrganicMenuItem[];
  /** Handle a chosen menu key; returns false for keys that aren't ours. */
  choose: (key: string) => boolean;
  /** The report dialog + block confirm; render once alongside the menu. */
  modals: ReactNode;
}

/**
 * Report + block for any「⋯」menu (profile, card page, conversation). One
 * hook so the three surfaces share wording, confirmation and side effects.
 * After a block every SWR key revalidates — feeds, lists and profiles all
 * re-read through the block filter in lib/data/hooks.
 */
export function useSafetyActions({ report, isBlocked = false, onBlockedChange }: SafetyActionsOptions): SafetyActions {
  const t = useTranslations('safety');
  const { mutate } = useSWRConfig();
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const reportLoaded = useOpenedOnce(reporting);

  const handle = report.handle ?? t('anonymousAuthor');
  const refreshAll = () => void mutate(() => true);

  const items: OrganicMenuItem[] = [
    {
      key: 'safety:report',
      icon: 'flag',
      label: report.type === 'card' ? t('reportCard') : report.type === 'user' ? t('reportUser') : t('reportMessage'),
    },
    isBlocked
      ? { key: 'safety:unblock', icon: 'ban', label: t('unblock') }
      : { key: 'safety:block', icon: 'ban', label: t('block'), danger: true },
  ];

  async function unblock() {
    setBusy(true);
    try {
      await unblockUser(report.userId);
      onBlockedChange?.(false);
      refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlock() {
    if (busy) return;
    setBusy(true);
    try {
      await blockUser(report.userId);
      setConfirmingBlock(false);
      onBlockedChange?.(true);
      refreshAll();
    } finally {
      setBusy(false);
    }
  }

  function choose(key: string): boolean {
    if (key === 'safety:report') setReporting(true);
    else if (key === 'safety:block') setConfirmingBlock(true);
    else if (key === 'safety:unblock') void unblock();
    else return false;
    return true;
  }

  const modals = (
    <>
      {reportLoaded && (
        <ReportModal
          open={reporting}
          target={report}
          offerBlock={!isBlocked}
          onClose={() => setReporting(false)}
          onReported={({ blocked }) => {
            if (!blocked) return;
            onBlockedChange?.(true);
            refreshAll();
          }}
        />
      )}
      <ConfirmModal
        open={confirmingBlock}
        title={t('blockTitle', { handle })}
        body={t('blockBody')}
        cancelLabel={t('cancel')}
        confirmLabel={t('blockConfirm')}
        onCancel={() => setConfirmingBlock(false)}
        onConfirm={() => void confirmBlock()}
        busy={busy}
        seed={71}
      />
    </>
  );

  return { items, choose, modals };
}
