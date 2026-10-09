'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import {
  SegmentedActionBar,
  type SegmentSpec,
} from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { useMyProfile } from '@/lib/data/hooks';
import { useHint } from '@/lib/hints';
import type { Visibility } from '@/lib/db/types';
import modalStyles from '@/components/molecules/Modal/Modal.module.css';
import styles from './PublishPanel.module.css';

const VISIBILITY_ICON: Record<'public' | 'private', 'globe' | 'lock'> = {
  public: 'globe',
  private: 'lock',
};

/**
 * An anonymous card is public or only its author's — never for connections
 * only, which would tell those few who wrote it (the server refuses it): one
 * asked for connections while anonymous is public instead.
 */
export function anonymousVisibility(visibility: Visibility, anonymous: boolean): Visibility {
  return anonymous && visibility === 'connections' ? 'public' : visibility;
}

export interface PublishPanelProps {
  open: boolean;
  onClose: () => void;
  /**
   * `'publish'` (default) sends a draft out for the first time. `'update'` is
   * the same screen for a card that is already live: no mirror moment (that
   * belongs to first publication) and the action reads 儲存修改 — this is the
   * click that puts a buffered revision in front of readers.
   */
  mode?: 'publish' | 'update';
  /** Current editor state — the draft may be unsaved, so the text travels along. */
  thoughtCore: string;
  story: string;
  initialVisibility: Visibility;
  initialAnonymous: boolean;
  pending: boolean;
  error: string | null;
  onPublish: (opts: { visibility: Visibility; anonymous: boolean }) => void;
}

/**
 * The publish panel (ux §6) — one screen, no wizard, ordered top-down:
 *
 *   1. AI insight echo (the mirror moment — `coreInsight` only, never a score)
 *   2. visibility
 *   3. publish anonymously (toggle + WYSIWYG card-head preview)
 *   4. the actions: 再想想 | 發布 (儲存修改), right-aligned, the verb rightmost
 *
 * The echo is fetched when the panel opens and is purely a grace note: the
 * publish button never waits for it.
 */
export function PublishPanel({
  open,
  onClose,
  mode = 'publish',
  thoughtCore,
  story,
  initialVisibility,
  initialAnonymous,
  pending,
  error,
  onPublish,
}: PublishPanelProps) {
  const t = useTranslations('write.publishPanel');
  const tVis = useTranslations('write.visibility');
  const { data: me } = useMyProfile();
  const anonymousHint = useHint('anonymous-publish');

  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [anonymous, setAnonymous] = useState(initialAnonymous);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const updating = mode === 'update';
  // One echo per opening — reopening re-reads the (possibly edited) draft.
  const openedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setVisibility(anonymousVisibility(initialVisibility, initialAnonymous));
    setAnonymous(initialAnonymous);
    setInsight(null);
    if (updating) return;
    setInsightLoading(true);
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/cards/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thoughtCore, story }),
        });
        const { coreInsight } = res.ok
          ? ((await res.json()) as { coreInsight?: string | null })
          : { coreInsight: null };
        if (alive) setInsight(coreInsight ?? null);
      } catch {
        if (alive) setInsight(null);
      } finally {
        if (alive) setInsightLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={pending ? undefined : onClose}
      maxWidth={480}
      seed={29}
      ariaLabel={updating ? t('updateTitle') : t('title')}
    >
      <div className={styles.panel}>
        <h2 className={styles.title}>{updating ? t('updateTitle') : t('title')}</h2>

        {/* 1 — the mirror moment (first publication only); for an update, the
            plain statement of what the button is about to do instead */}
        {updating && <p className={styles.hint}>{t('updateHint')}</p>}
        {(insightLoading || insight) && (
          <div className={styles.insight} data-loading={insightLoading || undefined}>
            {insightLoading ? (
              <>
                <SketchLoader size={28} seed={29} ariaLabel={t('insightLoading')} />
                <span className={styles.muted}>{t('insightLoading')}</span>
              </>
            ) : (
              <>
                <span className={styles.insightGlyph}>
                  <Icon name="sparkle" size={16} color="var(--color-terracotta)" />
                </span>
                <span>{t('insight', { coreInsight: insight! })}</span>
              </>
            )}
          </div>
        )}

        <Divider seed={31} spacing={2} />

        {/* 2 — visibility */}
        <div className={styles.group}>
          <span className={styles.label}>{tVis('label')}</span>
          <div className={styles.choice}>
            {/* A segmented choice with no pen line (its options are buttons):
                a quiet paper-dark track shows the control's extent, and the
                chosen side wears the tonal peach with the deep terracotta
                label (4.8:1); the other keeps a muted ink deep enough to read
                on the track. */}
            <SegmentedActionBar
              fill="var(--color-cream-dark)"
              segments={(['public', 'private'] as const).map((v) => {
                const active = visibility === v;
                const ink = active
                  ? 'var(--button-on-tonal)'
                  : 'color-mix(in oklch, var(--color-text-muted), black 10%)';
                return {
                  key: v,
                  icon: <Icon name={VISIBILITY_ICON[v]} size={16} color={ink} />,
                  label: tVis(v),
                  fill: active ? 'var(--button-tonal)' : 'transparent',
                  textColor: ink,
                  hoverOverlay: 'oklch(0% 0 0 / 0.05)',
                  ariaLabel: tVis(v),
                  onClick: () => setVisibility(v),
                } satisfies SegmentSpec;
              })}
            />
          </div>
          {/* Never for connections only: who could read it would say who wrote it. */}
          {anonymous && <p className={styles.note}>{t('anonymousVisibility')}</p>}
        </div>

        {/* 3 — anonymous toggle + WYSIWYG card-head preview */}
        <div className={styles.group}>
          <label className={styles.toggleRow}>
            {t('anonymousToggle')}
            <ToggleSwitch
              checked={anonymous}
              onChange={() => {
                setAnonymous(!anonymous);
                setVisibility((v) => anonymousVisibility(v, !anonymous));
              }}
              ariaLabel={t('anonymousToggle')}
              seed={57}
            />
          </label>
          {/* Seeing is understanding: the exact card head the world will get. */}
          <div className={styles.byline}>
            {anonymous ? (
              <HandDrawnAvatar initials="·" size={34} color="var(--color-cream-dark)" seed={97} />
            ) : (
              <HandDrawnAvatar
                src={me?.avatarUrl}
                initials={me?.initials ?? '?'}
                size={34}
                color={me?.accentColor ?? 'oklch(88% 0.08 55)'}
                seed={Number(me?.avatarSeed ?? 0)}
              />
            )}
            <span className={styles.name} data-anonymous={anonymous || undefined}>
              {anonymous ? t('anonymousName') : me?.handle ?? ''}
            </span>
          </div>
          {anonymousHint.visible && <p className={styles.note}>{t('anonymousHint')}</p>}
        </div>

        <Divider seed={47} spacing={2} />

        {/* 4 — the foot every dialog shares: right-aligned, 再想想 the tonal
            way out, the verb solid and rightmost; why the last try failed
            right above it. */}
        <div>
          {error && (
            <p className={modalStyles.error} role="alert">
              {error}
            </p>
          )}
          <ModalActions busy={pending}>
            <OrganicButton variant="tonal" size="sm" onClick={onClose}>
              {t('cancel')}
            </OrganicButton>
            <OrganicButton
              variant="solid"
              size="sm"
              onClick={() => onPublish({ visibility: anonymousVisibility(visibility, anonymous), anonymous })}
            >
              {updating
                ? pending
                  ? t('updating')
                  : t('update')
                : pending
                ? t('publishing')
                : t('publish')}
            </OrganicButton>
          </ModalActions>
        </div>
      </div>
    </Modal>
  );
}
