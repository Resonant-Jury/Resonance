'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { CharCount, Field, Select, Textarea } from '@/components/atoms/Field/Field';
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/db/firestore/client/reports';
import { blockUser } from '@/lib/db/firestore/client/blocks';
import styles from './ReportModal.module.css';

export interface ReportTarget {
  type: ReportTargetType;
  /** Card id, user id, or message/conversation id. */
  id: string;
  /**
   * The person responsible for the content — empty when this viewer can't
   * know it (someone else's anonymous card): the server finds them, and
   * nothing offers to block them.
   */
  userId: string;
  /** Shown in the title and the "also block" row; omit for anonymous authors. */
  handle?: string;
  contextId?: string;
}

export interface ReportModalProps {
  open: boolean;
  target: ReportTarget;
  /** Offer "also block this person" (off when they're already blocked). */
  offerBlock?: boolean;
  onClose: () => void;
  /** Called after the report (and optional block) went through. */
  onReported?: (result: { blocked: boolean }) => void;
}

/**
 * 檢舉 — pick a reason, optionally add details, optionally block in the same
 * step. After sending, the dialog turns into a thank-you note instead of
 * closing, so the person knows the report arrived.
 */
export function ReportModal({ open, target, offerBlock = true, onClose, onReported }: ReportModalProps) {
  const t = useTranslations('safety.report');
  const tSafety = useTranslations('safety');
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<{ blocked: boolean } | null>(null);

  // Every opening starts from a blank form.
  useEffect(() => {
    if (!open) return;
    setReason('spam');
    setDetail('');
    setAlsoBlock(false);
    setError(false);
    setDone(null);
  }, [open]);

  const handle = target.handle ?? tSafety('anonymousAuthor');
  const title =
    target.type === 'card'
      ? t('titleCard')
      : target.type === 'user'
        ? t('titleUser', { handle })
        : t('titleMessage', { handle });

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      // The server finds who is responsible (an anonymous card's author too).
      await submitReport({
        targetType: target.type,
        targetId: target.id,
        reason,
        detail,
        contextId: target.contextId,
      });
      const blocked = offerBlock && alsoBlock && !!target.userId;
      if (blocked) await blockUser(target.userId);
      setDone({ blocked });
      onReported?.({ blocked });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} maxWidth={460} seed={83} ariaLabel={title}>
      {done ? (
        <div className={styles.stack}>
          <h3 className={styles.title}>{t('doneTitle')}</h3>
          <p className={styles.body}>{t('doneBody')}</p>
          {done.blocked && <p className={styles.body}>{t('doneBlocked', { handle })}</p>}
          <div className={styles.actions}>
            {/* The one way out: a close, so the quiet tonal pill, not a verb. */}
            <OrganicButton variant="text" size="sm" onClick={onClose}>
              {t('close')}
            </OrganicButton>
          </div>
        </div>
      ) : (
        <div className={styles.stack}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.body}>{t('intro')}</p>
          <Field label={t('reason')}>
            <Select seed={87} value={reason} onChange={(v) => setReason(v as ReportReason)} ariaLabel={t('reason')}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('detail')}
            htmlFor="report-detail"
            trailing={<CharCount count={detail.length} max={REPORT_DETAIL_MAX} />}
          >
            <Textarea
              id="report-detail"
              seed={89}
              rows={3}
              autoGrow
              value={detail}
              placeholder={t('detailPlaceholder')}
              onChange={(e) => setDetail(e.target.value.slice(0, REPORT_DETAIL_MAX))}
            />
          </Field>
          {offerBlock && (
            <label className={styles.blockRow}>
              <span>{t('alsoBlock', { handle })}</span>
              <ToggleSwitch
                checked={alsoBlock}
                onChange={() => setAlsoBlock((v) => !v)}
                ariaLabel={t('alsoBlock', { handle })}
                seed={91}
              />
            </label>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {tSafety('actionError')}
            </p>
          )}
          <div className={styles.actions} data-busy={busy || undefined}>
            {/* The modal is the frame: cancel is plain text, the verb a solid fill. */}
            <OrganicButton variant="text" size="sm" onClick={onClose}>
              {tSafety('cancel')}
            </OrganicButton>
            <OrganicButton variant="solid" size="sm" onClick={() => void send()}>
              {busy ? '…' : t('submit')}
            </OrganicButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
