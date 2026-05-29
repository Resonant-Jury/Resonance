'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { Icon } from '@/components/atoms/Icon';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Field, Textarea, CharCount } from '@/components/atoms/Field/Field';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useRef } from 'react';
import type { IconName } from '@/components/atoms/Icon';
import { Panel } from '@/components/molecules/Panel/Panel';
import {
  createCardDraft,
  publishCard,
  updateCardDraft,
} from '@/lib/db/firestore/client/cards';
import type { CardMedia, Visibility, Locale } from '@/lib/db/types';
import { useRouter } from '@/i18n/navigation';
import styles from './CardEditor.module.css';

export interface CardEditorProps {
  initial?: {
    id?: string;
    thoughtCore?: string;
    story?: string;
    tags?: string[];
    visibility?: Visibility;
    media?: CardMedia;
  };
  locale: Locale;
}

const SAMPLE_TAGS = ['脆弱性', '記憶', '成長', '家族', '陌生人', '夜晚', '和解', '書寫'];
const SAMPLE_TITLES = [
  '有些話,寫下來,是為了自己先聽見。',
  '被看見,比被喜歡更難得。',
  '停下來看一件小事,是一種慢慢的勇敢。',
];

const VISIBILITY_ICON: Record<Visibility, 'globe' | 'users' | 'lock'> = {
  public: 'globe',
  connections: 'users',
  private: 'lock',
};

export function CardEditor({ initial, locale }: CardEditorProps) {
  const t = useTranslations('write');
  const tVis = useTranslations('write.visibility');
  const tAi = useTranslations('write.ai');
  const router = useRouter();

  const [thoughtCore, setThoughtCore] = useState(initial?.thoughtCore ?? '');
  const [story, setStory] = useState(initial?.story ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [media, setMedia] = useState<CardMedia | undefined>(initial?.media);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [polishPreview, setPolishPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const storyLen = story.length;
  const storyState =
    storyLen < 300 ? 'short' : storyLen > 1200 ? 'long' : 'ok';

  // Autosave stub — every 10s if dirty
  useEffect(() => {
    if (!thoughtCore && !story) return;
    const h = setTimeout(() => setSavedAt(new Date()), 10_000);
    return () => clearTimeout(h);
  }, [thoughtCore, story, tags, visibility]);

  const autosavedLabel = useMemo(() => {
    if (!savedAt) return null;
    return t('autosaved', {
      time: savedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    });
  }, [savedAt, locale, t]);

  function suggestTags() {
    const picked: string[] = [];
    for (const x of SAMPLE_TAGS) {
      if (picked.length >= 4) break;
      if (!tags.includes(x)) picked.push(x);
    }
    setTags([...tags, ...picked.slice(0, 4 - tags.length)]);
  }
  function suggestTitles() {
    setTitleSuggestions(SAMPLE_TITLES);
  }
  function stubPolish() {
    setPolishPreview(story.replace(/\n{3,}/g, '\n\n').trim());
  }

  function removeTag(tag: string) {
    setTags(tags.filter((x) => x !== tag));
  }

  async function saveDraft() {
    const card = initial?.id
      ? await updateCardDraft(initial.id, { thoughtCore, story, tags, visibility, media })
      : await createCardDraft({
          thoughtCore,
          story,
          tags,
          visibility,
          originalLocale: locale,
          media,
        });
    setSavedAt(new Date());
    return card;
  }

  async function submit() {
    if (pending) return;
    setPending(true);
    setPublishError(null);
    try {
      const card = await saveDraft();
      const published = await publishCard(card.id);
      router.push(`/card/${published.id}`);
    } catch (err) {
      console.error('Publish failed:', err);
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function uploadImage(file: File) {
    setUploadError(null);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
        kind: 'image',
      }),
    });
    if (!res.ok) {
      setUploadError(t('mediaUploadError'));
      return;
    }
    const upload = (await res.json()) as {
      uploadUrl: string;
      publicUrl: string;
      headers: Record<string, string>;
    };
    const uploadRes = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: file,
    });
    if (!uploadRes.ok) {
      setUploadError(t('mediaUploadError'));
      return;
    }
    setMedia({ type: 'image', url: upload.publicUrl, label: file.name });
  }

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        {/* Core */}
        <Field
          label={t('coreLabel')}
          htmlFor="card-core"
          trailing={<CharCount count={thoughtCore.length} max={60} />}
        >
          <Textarea
            id="card-core"
            value={thoughtCore}
            onChange={(e) => setThoughtCore(e.target.value.slice(0, 60))}
            placeholder={t('corePlaceholder')}
            rows={2}
            tone="display"
          />
          {titleSuggestions.length > 0 && (
            <div className={styles.suggestionList}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{tAi('title')}</div>
              {titleSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.suggestionBtn}
                  onClick={() => {
                    setThoughtCore(s);
                    setTitleSuggestions([]);
                  }}
                >
                  <Icon name="sparkle" size={14} color="var(--color-terracotta)" /> {s}
                </button>
              ))}
            </div>
          )}
        </Field>

        {/* Story */}
        <Field
          label={t('storyLabel')}
          htmlFor="card-story"
          hint={
            storyState === 'short'
              ? t('storyMin', { count: storyLen })
              : storyState === 'ok'
              ? t('storyOk')
              : t('storyLong')
          }
          hintTone={storyState === 'ok' ? 'ok' : 'default'}
        >
          <Textarea
            id="card-story"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder={t('storyPlaceholder')}
            rows={14}
            style={{ fontSize: 16, lineHeight: 1.7 }}
          />
          {polishPreview && (
            <div className={styles.polishPreview}>
              <div className={styles.polishHeader}>
                <span>
                  <Icon name="sparkle" size={12} /> {tAi('polish')} · diff 預覽
                </span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Dismiss polish preview"
                  onClick={() => setPolishPreview(null)}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              <pre className={styles.polishText}>{polishPreview}</pre>
              <div style={{ display: 'flex', gap: 8 }}>
                <OrganicButton
                  variant="primary"
                  onClick={() => {
                    setStory(polishPreview);
                    setPolishPreview(null);
                  }}
                >
                  {tAi('apply')}
                </OrganicButton>
                <OrganicButton variant="ghost" onClick={() => setPolishPreview(null)}>
                  {tAi('keep')}
                </OrganicButton>
              </div>
            </div>
          )}
        </Field>

        {/* Tags */}
        <Field label={t('tagsLabel')}>
          <div className={styles.tagRow}>
            {tags.map((tag) => (
              <TagPill
                key={tag}
                size="md"
                color="oklch(92% 0.075 88)"
                onRemove={() => removeTag(tag)}
              >
                {tag}
              </TagPill>
            ))}
            <AddTagButton label={t('tagsSuggest')} onClick={suggestTags} />
          </div>
        </Field>

        {/* Media */}
        <Field label={t('mediaLabel')}>
          {media && (
            <div className={styles.mediaRow}>
              <HandDrawnDashedSurface seed={29} R={14} className={styles.mediaThumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media.url} alt={media.label ?? ''} className={styles.mediaThumb} />
              </HandDrawnDashedSurface>
              <OrganicButton variant="ghost" onClick={() => setMedia(undefined)}>
                {t('mediaRemove')}
              </OrganicButton>
            </div>
          )}
          <label
            className={styles.uploadZone}
            data-drag={dragOver || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void uploadImage(file);
            }}
          >
            <HandDrawnDashedSurface
              seed={31}
              R={16}
              state={dragOver ? 'focus' : 'idle'}
              className={styles.fileInputWrap}
            >
              <span className={styles.uploadInner}>
                <Icon name="image" size={26} color="var(--color-terracotta)" />
                <span className={styles.uploadText}>{t('mediaPlaceholder')}</span>
                <span className={styles.uploadHint}>{t('mediaHint')}</span>
              </span>
            </HandDrawnDashedSurface>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void uploadImage(file);
                e.currentTarget.value = '';
              }}
              className={styles.fileInputHidden}
            />
          </label>
          {uploadError && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-terracotta)' }}>
              {uploadError}
            </div>
          )}
        </Field>

        {/* Visibility */}
        <Field label={t('visibility.label')}>
          <div className={styles.visibilityRow} role="radiogroup" aria-label={t('visibility.label')}>
            {(['public', 'connections', 'private'] as Visibility[]).map((v, i) => (
              <VisibilityChip
                key={v}
                value={v}
                index={i}
                active={visibility === v}
                icon={VISIBILITY_ICON[v]}
                label={tVis(v)}
                onSelect={() => setVisibility(v)}
              />
            ))}
          </div>
        </Field>

        {/* Actions */}
        <div className={styles.actions}>
          <OrganicButton
            variant="outline"
            onClick={() => {
              if (pending) return;
              setPending(true);
              setPublishError(null);
              saveDraft()
                .catch((err) => {
                  console.error('Save draft failed:', err);
                  setPublishError(err instanceof Error ? err.message : String(err));
                })
                .finally(() => setPending(false));
            }}
          >
            {t('saveDraft')}
          </OrganicButton>
          <div style={{ opacity: pending ? 0.6 : 1, pointerEvents: pending ? 'none' : 'auto' }}>
            <OrganicButton variant="primary" onClick={submit}>
              {pending ? t('publishing') : t('publish')}
            </OrganicButton>
          </div>
          {publishError && (
            <span style={{ fontSize: 12, color: 'var(--color-terracotta)' }}>
              {publishError}
            </span>
          )}
          {autosavedLabel && (
            <span className={styles.autosave}>
              <Icon name="check" size={12} color="oklch(55% 0.13 140)" /> {autosavedLabel}
            </span>
          )}
        </div>
      </div>

      {/* AI Assist Panel — flat panel separated by Dividers, no nested cards. */}
      <Panel
        title={
          <>
            <Icon name="sparkle" size={16} color="var(--color-terracotta)" />
            {tAi('panel')}
          </>
        }
        footer={tAi('stubNotice')}
        sticky
        collapseOnMobile
      >
        <AiRow icon="sparkle" title={tAi('polish')} hint={tAi('polishHint')} onClick={stubPolish} />
        <Divider seed={11} />
        <AiRow icon="star" title={tAi('title')} hint={tAi('titleHint')} onClick={suggestTitles} />
        <Divider seed={23} />
        <AiRow icon="plus" title={tAi('tags')} hint={tAi('tagsHint')} onClick={suggestTags} />
      </Panel>
    </div>
  );
}

interface AiRowProps {
  icon: 'sparkle' | 'star' | 'plus';
  title: string;
  hint: string;
  onClick: () => void;
}

interface VisibilityChipProps {
  value: Visibility;
  index: number;
  active: boolean;
  icon: IconName;
  label: string;
  onSelect: () => void;
}

function VisibilityChip({ value, index, active, icon, label, onSelect }: VisibilityChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref, 120, 44);
  const [hover, setHover] = useState(false);
  const rot = (index - 1) * 1.6;
  const seeds = [41, 47, 53];
  const strokeColor = active
    ? 'var(--color-terracotta)'
    : hover
    ? 'var(--field-border-hover)'
    : 'var(--field-border)';
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={active}
      data-value={value}
      data-active={active || undefined}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={styles.visibilityChip}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={Math.min(h / 2, 22)}
        seed={seeds[index] ?? 41}
        cornerJitter={1.6}
        cornerOffset={2.2}
        strokeColor={strokeColor}
        strokeWidth={active ? 2.6 : 2}
        fillColor={active ? 'oklch(92% 0.06 55 / 0.55)' : 'transparent'}
      />
      <span className={styles.visibilityChipBody}>
        <Icon name={icon} size={16} color={active ? 'var(--color-terracotta)' : 'currentColor'} />
        {label}
      </span>
    </button>
  );
}

function AddTagButton({ label, onClick }: { label: string; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref, 130, 32);
  const [hover, setHover] = useState(false);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={styles.addTag}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={Math.min(h / 2, 18)}
        seed={67}
        strokeColor={hover ? 'var(--field-border-hover)' : 'var(--field-border)'}
        strokeWidth={2}
        fillColor="transparent"
      />
      <span className={styles.addTagBody}>
        <Icon name="plus" size={12} /> {label}
      </span>
    </button>
  );
}

function AiRow({ icon, title, hint, onClick }: AiRowProps) {
  return (
    <button type="button" onClick={onClick} className={styles.aiRow}>
      <span className={styles.aiRowTitle}>
        <Icon name={icon} size={14} color="var(--color-terracotta)" />
        {title}
      </span>
      <span className={styles.aiRowHint}>{hint}</span>
    </button>
  );
}
