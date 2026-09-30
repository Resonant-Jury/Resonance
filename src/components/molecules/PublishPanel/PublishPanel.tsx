'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
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

const VISIBILITY_ICON: Record<'public' | 'private', 'globe' | 'lock'> = {
  public: 'globe',
  private: 'lock',
};

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
 *   4. the publish button
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
    setVisibility(initialVisibility);
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--color-text)',
          }}
        >
          {updating ? t('updateTitle') : t('title')}
        </h2>

        {/* 1 — the mirror moment (first publication only); for an update, the
            plain statement of what the button is about to do instead */}
        {updating && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--color-text-muted)',
              margin: 0,
            }}
          >
            {t('updateHint')}
          </p>
        )}
        {(insightLoading || insight) && (
          <div
            style={{
              display: 'flex',
              alignItems: insightLoading ? 'center' : 'flex-start',
              gap: 10,
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--color-text)',
            }}
          >
            {insightLoading ? (
              <>
                <SketchLoader size={28} seed={29} ariaLabel={t('insightLoading')} />
                <span style={{ color: 'var(--color-text-muted)' }}>{t('insightLoading')}</span>
              </>
            ) : (
              <>
                <span style={{ flexShrink: 0, marginTop: 2 }}>
                  <Icon name="sparkle" size={16} color="var(--color-terracotta)" />
                </span>
                <span>{t('insight', { coreInsight: insight! })}</span>
              </>
            )}
          </div>
        )}

        <Divider seed={31} spacing={2} />

        {/* 2 — visibility */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span
            style={{
              fontSize: 'var(--label-size)',
              letterSpacing: 'var(--label-tracking)',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {tVis('label')}
          </span>
          <div style={{ display: 'flex' }}>
            <SegmentedActionBar
              segments={(['public', 'private'] as const).map((v) => {
                const active = visibility === v;
                return {
                  key: v,
                  icon: (
                    <Icon
                      name={VISIBILITY_ICON[v]}
                      size={16}
                      color={active ? 'var(--color-terracotta)' : 'var(--color-text-muted)'}
                    />
                  ),
                  label: tVis(v),
                  fill: active
                    ? 'color-mix(in oklch, var(--color-terracotta-light) 60%, transparent)'
                    : 'transparent',
                  textColor: active ? 'var(--color-terracotta)' : 'var(--color-text-muted)',
                  hoverOverlay: 'oklch(0% 0 0 / 0.05)',
                  ariaLabel: tVis(v),
                  onClick: () => setVisibility(v),
                } satisfies SegmentSpec;
              })}
            />
          </div>
        </div>

        {/* 3 — anonymous toggle + WYSIWYG card-head preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            {t('anonymousToggle')}
            <ToggleSwitch
              checked={anonymous}
              onChange={() => setAnonymous(!anonymous)}
              ariaLabel={t('anonymousToggle')}
              seed={57}
            />
          </label>
          {/* Seeing is understanding: the exact card head the world will get. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 14,
                color: anonymous ? 'var(--color-text-muted)' : 'var(--color-text)',
              }}
            >
              {anonymous ? t('anonymousName') : me?.handle ?? ''}
            </span>
          </div>
          {anonymousHint.visible && (
            <p style={{ fontSize: 'var(--hint-size, 12px)', color: 'var(--color-text-muted)' }}>
              {t('anonymousHint')}
            </p>
          )}
        </div>

        <Divider seed={47} spacing={2} />

        {/* 4 — publish. The modal is the frame: the verb is a solid fill, cancel plain text. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ opacity: pending ? 0.6 : 1, pointerEvents: pending ? 'none' : 'auto' }}>
            <OrganicButton variant="solid" size="sm" onClick={() => onPublish({ visibility, anonymous })}>
              {updating
                ? pending
                  ? t('updating')
                  : t('update')
                : pending
                ? t('publishing')
                : t('publish')}
            </OrganicButton>
          </div>
          <OrganicButton variant="text" size="sm" onClick={onClose}>
            {t('cancel')}
          </OrganicButton>
          {error && (
            <span style={{ fontSize: 12, color: 'var(--color-terracotta)' }}>{error}</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
