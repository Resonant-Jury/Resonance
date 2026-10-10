'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import { CardPickList } from '@/components/molecules/CardPicker/CardPickList';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { useRouter } from '@/i18n/navigation';
import { useMyCardBox } from '@/lib/data/hooks';
import { useResonanceRefresh } from '@/lib/data/resonate';
import { ApiError } from '@/lib/db/firestore/client/api';
import { resonateWith } from '@/lib/db/firestore/client/cards';
import type { Card } from '@/lib/db/types';
import { storyLinkWaveVars } from '@/lib/design/storyLinkWave';
import styles from './ResonatePicker.module.css';

/**
 * Which of the viewer's published cards may resonate with `targetId`: the
 * public ones not answering a card already (one card answers one card),
 * never the target itself nor the card the target answers (it would answer
 * its own answer). `hidden` counts the public cards left out for answering
 * another card — the picker says why they are missing; `open` all the public
 * cards there are to choose from, left out or not — none at all is when the
 * viewer has "no public cards yet".
 */

/** The story link's pen wave, which the「寫一張新卡片」row wears under a pointer. */
const WRITE_NEW_WAVE = storyLinkWaveVars('resonate:write-new') as CSSProperties;

export function resonateChoices(
  cards: Card[],
  targetId: string,
  targetReferenceId?: string,
): { cards: Card[]; hidden: number; open: number } {
  const open = cards.filter((c) => c.visibility === 'public' && !!c.publishedAt && c.id !== targetId);
  return {
    cards: open.filter((c) => !c.referenceCardId && c.id !== targetReferenceId),
    hidden: open.filter((c) => c.referenceCardId && c.referenceCardId !== targetId).length,
    open: open.length,
  };
}

export interface ResonatePickerProps {
  open: boolean;
  onClose: () => void;
  /** The card being answered (its id). */
  targetId: string;
  /** The card the target itself answers, if any: never offered. */
  targetReferenceId?: string;
  /** Called with the card that now resonates, once the server said so. */
  onResonated?: (card: Card) => void;
}

/**
 * 共振 opens this: write a new card in answer (the writer, as before), or
 * pick one of your published public cards about something similar, which
 * the server then points at this card (POST /api/v1/cards/{id}/resonances).
 * A tap marks a card and 共振 confirms it — the choice rings someone's
 * phone, so a stray tap in a scrolling list must not send it.
 *
 * A quiet list (round 4, variant A): the title alone; "write a new card" as
 * one terracotta line with the pen; one wavy rule; rows of a 40px thumb, the
 * title on one line and one muted line under it (when it came out, 匿名 ·
 * first for an anonymous card); why some cards are missing only when some
 * are; the error line; then cancel | 共振.
 */
export function ResonatePicker({ open, onClose, targetId, targetReferenceId, onResonated }: ResonatePickerProps) {
  const t = useTranslations('card.resonatePicker');
  const tNative = useTranslations('native');
  const router = useRouter();
  const refresh = useResonanceRefresh();
  // The card box's published shelf: one cache with the box, read when shown.
  const { data, error: readError, mutate: readAgain } = useMyCardBox(open ? 'published' : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'failed' | 'alreadyAnswering' | null>(null);

  const loaded = data ? resonateChoices(data.cards, targetId, targetReferenceId) : null;
  const selected = loaded?.cards.find((c) => c.id === selectedId) ?? null;
  // Public cards there are, only none may answer this one and none is left out for answering another (the only
  // one is the card this one answers): nothing to pick and nothing to say, so no caption over an empty list.
  const nothingToPick = !!loaded && loaded.open > 0 && loaded.cards.length === 0 && loaded.hidden === 0;

  function close() {
    if (!busy) onClose();
  }

  function writeNew() {
    if (busy) return;
    onClose();
    router.push(`/write?referenceCardId=${targetId}`);
  }

  function choose(card: Card) {
    if (busy) return;
    setFailure(null);
    setSelectedId(card.id);
  }

  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await resonateWith(targetId, selected.id);
      refresh(targetId, selected);
      onResonated?.(selected);
      onClose();
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      setFailure(conflict ? 'alreadyAnswering' : 'failed');
      // What this browser holds is out of date (the card answers another by
      // now, or another of yours answers this one): the mark goes, as in the
      // apps, and everything is read again — the shelf this list comes from
      // among it.
      if (conflict) {
        setSelectedId(null);
        refresh(targetId, selected);
      }
    } finally {
      setBusy(false);
    }
  }

  const lead = (
    <>
      <button type="button" className={styles.writeNew} onClick={writeNew} disabled={busy}>
        <Icon name="pen" size={18} color="var(--color-terracotta)" />
        <span className={styles.writeTitle} style={WRITE_NEW_WAVE}>
          {t('writeNew')}
        </span>
      </button>
      {/* Nothing to pick and nothing to say: no rule over an empty list. */}
      {!nothingToPick && <Divider seed={59} spacing={8} />}
    </>
  );

  return (
    <Modal open={open} onClose={close} maxWidth={480} seed={53} padding="26px 24px 22px" ariaLabel={t('title')}>
      <h3 className={styles.title}>{t('title')}</h3>

      <CardPickList
        cards={loaded?.cards ?? []}
        lead={lead}
        selectedId={selectedId}
        label={t('title')}
        onPick={choose}
        disabled={busy}
        anonymousLabel={t('anonymous')}
        empty={
          loaded ? (
            // Public cards there are, only none may answer this one: never "no public cards yet". Why
            // they are missing, when it is that they answer another card; else the first row is the way.
            loaded.open === 0 ? t('empty') : loaded.hidden > 0 ? t('hiddenNote') : null
          ) : readError ? (
            <div className={styles.readFailed} role="alert">
              <span>{tNative('loadError')}</span>
              <OrganicButton variant="tonal" size="sm" onClick={() => void readAgain()}>
                {tNative('retry')}
              </OrganicButton>
            </div>
          ) : (
            <PickSkeleton />
          )
        }
        footnote={loaded && loaded.cards.length > 0 && loaded.hidden > 0 ? t('hiddenNote') : undefined}
      />

      {failure && (
        <p className={styles.error} role="alert">
          {t(failure)}
        </p>
      )}

      <ModalActions>
        {/* The modal is the frame: cancel is the tonal pill, the verb a solid fill, rightmost. While the
            choice is on its way cancel is visibly out of reach and the verb's pen keeps inking. */}
        <OrganicButton variant="tonal" size="sm" onClick={close} disabled={busy}>
          {t('cancel')}
        </OrganicButton>
        <OrganicButton variant="solid" size="sm" onClick={() => void confirm()} disabled={!selected}>
          {busy ? (
            // The pen keeps inking where the wave was while the server answers.
            <SketchLoader size={16} seed={53} color="var(--color-cream)" />
          ) : (
            <Icon name="wave" size={16} />
          )}
          {t('confirm')}
        </OrganicButton>
      </ModalActions>
    </Modal>
  );
}

/** The rows' footprint while the shelf is read: plain CSS chrome, no measured shapes. */
function PickSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={40} height={40} radius={12} />
          <div className={styles.skeletonText}>
            <Skeleton width={`${70 - i * 12}%`} height={14} />
            <Skeleton width={64} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
