'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { CardPickList } from '@/components/molecules/CardPicker/CardPickList';
import { Divider } from '@/components/atoms/Divider/Divider';
import { HandDrawnDashedBorder } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { useRouter } from '@/i18n/navigation';
import { useMyCardBox } from '@/lib/data/hooks';
import { useResonanceRefresh } from '@/lib/data/resonate';
import { ApiError } from '@/lib/db/firestore/client/api';
import { resonateWith } from '@/lib/db/firestore/client/cards';
import { INK_LIGHT } from '@/lib/design/strokes';
import type { Card } from '@/lib/db/types';
import styles from './ResonatePicker.module.css';

/** The write-new tile's size: fixed, so its outline is drawn at once (no measuring). */
const TILE = 48;

/**
 * Which of the viewer's published cards may resonate with `targetId`: the
 * public ones not answering a card already (one card answers one card),
 * never the target itself nor the card the target answers (it would answer
 * its own answer). `hidden` counts the public cards left out for answering
 * another card — the picker says why they are missing; `open` all the public
 * cards there are to choose from, left out or not — none at all is when the
 * viewer has "no public cards yet".
 */
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
      // What this browser holds may be out of date (the card answers another
      // by now, or another of yours answers this one): read it again — the
      // shelf this list comes from among it.
      if (conflict) refresh(targetId, selected);
    } finally {
      setBusy(false);
    }
  }

  const lead = (
    <>
      <button type="button" className={styles.writeNew} onClick={writeNew} disabled={busy}>
        <span className={styles.writeTile} aria-hidden>
          <HandDrawnDashedBorder
            w={TILE}
            h={TILE}
            R={14}
            seed={29}
            mag={1.6}
            curve={1.2}
            segmentsH={2}
            segmentsV={2}
            strokeColor="color-mix(in oklch, var(--color-terracotta) 70%, transparent)"
            strokeWidth={INK_LIGHT}
            fillColor="color-mix(in oklch, var(--color-terracotta) 10%, transparent)"
          />
          <Icon name="pen" size={22} color="var(--color-terracotta)" className={styles.writeGlyph} />
        </span>
        <span className={styles.writeText}>
          <span className={styles.writeTitle}>{t('writeNew')}</span>
          <span className={styles.writeHint}>{t('writeNewHint')}</span>
        </span>
        <Icon name="arrow-right" size={18} className={styles.writeArrow} />
      </button>
      {!nothingToPick && (
        <>
          <Divider seed={59} spacing={8} />
          <p className={styles.pickHeading}>{t('pickHeading')}</p>
        </>
      )}
    </>
  );

  return (
    <Modal open={open} onClose={close} maxWidth={480} seed={53} padding="26px 24px 22px" ariaLabel={t('title')}>
      <h3 className={styles.title}>{t('title')}</h3>
      <p className={styles.subtitle}>{t('subtitle')}</p>

      <CardPickList
        cards={loaded?.cards ?? []}
        lead={lead}
        selectedId={selectedId}
        label={t('pickHeading')}
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
              <OrganicButton variant="textAccent" size="sm" onClick={() => void readAgain()}>
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

      <div className={styles.actions}>
        {/* The modal is the frame: cancel is plain text, the verb a solid fill. */}
        <OrganicButton variant="text" size="sm" onClick={close}>
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
      </div>
    </Modal>
  );
}

/** The rows' footprint while the shelf is read: plain CSS chrome, no measured shapes. */
function PickSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={48} height={48} radius={14} />
          <Skeleton width={`${62 - i * 12}%`} height={14} />
        </div>
      ))}
    </div>
  );
}
