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
import { HandDrawnImage } from '@/components/atoms/HandDrawnImage/HandDrawnImage';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { MarkdownEditor } from '@/components/molecules/MarkdownEditor/MarkdownEditor';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useRef } from 'react';
// import { Panel } from '@/components/molecules/Panel/Panel'; // AI 寫作夥伴（暫停）
import {
  SegmentedActionBar,
  type SegmentSpec,
} from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
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
// AI 寫作夥伴：暫時停用，未來會重新啟用
// const SAMPLE_TITLES = [
//   '有些話,寫下來,是為了自己先聽見。',
//   '被看見,比被喜歡更難得。',
//   '停下來看一件小事,是一種慢慢的勇敢。',
// ];

const VISIBILITY_ICON: Record<Visibility, 'globe' | 'users' | 'lock'> = {
  public: 'globe',
  connections: 'users',
  private: 'lock',
};

export function CardEditor({ initial, locale }: CardEditorProps) {
  const t = useTranslations('write');
  const tVis = useTranslations('write.visibility');
  // const tAi = useTranslations('write.ai'); // AI 寫作夥伴：暫時停用
  const router = useRouter();

  const [thoughtCore, setThoughtCore] = useState(initial?.thoughtCore ?? '');
  const [story, setStory] = useState(initial?.story ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [media, setMedia] = useState<CardMedia | undefined>(initial?.media);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // AI 寫作夥伴：暫時停用，未來會重新啟用
  // const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  // const [polishPreview, setPolishPreview] = useState<string | null>(null);
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
  // AI 寫作夥伴：暫時停用，未來會重新啟用
  // function suggestTitles() {
  //   setTitleSuggestions(SAMPLE_TITLES);
  // }
  // function stubPolish() {
  //   setPolishPreview(story.replace(/\n{3,}/g, '\n\n').trim());
  // }

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
      // Auto-generate the English URL slug (LLM translation of the title, made
      // collision-free server-side). Fall back to the doc id if it fails so
      // publishing never blocks on the AI step.
      let destination = published.id;
      try {
        const res = await fetch('/api/cards/slug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: published.id }),
        });
        if (res.ok) {
          const { slug } = (await res.json()) as { slug?: string };
          if (slug) destination = slug;
        }
      } catch {
        // keep the doc-id destination
      }
      router.push(`/card/${destination}`);
    } catch (err) {
      console.error('Publish failed:', err);
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const mediaBusy = uploading || generating;
  const canGenerate = story.trim().length > 0 && !mediaBusy;

  async function generateFromStory() {
    if (mediaBusy || story.trim().length === 0) return;
    setUploadError(null);
    setGenerating(true);
    try {
      // The story body lives only in editor state here (the draft may be
      // unsaved), so send it to the server, which distills it into an imagery
      // prompt, renders the doodle, stores it in R2, and returns the URL.
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      if (!res.ok) {
        setUploadError(t('mediaGenerateError'));
        return;
      }
      const { publicUrl } = (await res.json()) as { publicUrl: string };
      setMedia({ type: 'image', url: publicUrl, label: t('mediaGeneratedLabel') });
    } catch {
      setUploadError(t('mediaGenerateError'));
    } finally {
      setGenerating(false);
    }
  }

  async function uploadImage(file: File) {
    if (mediaBusy) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Send the file to our own API route; the server streams it to R2. The
      // browser never contacts the R2 storage host directly.
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) {
        setUploadError(t('mediaUploadError'));
        return;
      }
      const { publicUrl } = (await res.json()) as { publicUrl: string };
      setMedia({ type: 'image', url: publicUrl, label: file.name });
    } catch {
      setUploadError(t('mediaUploadError'));
    } finally {
      setUploading(false);
    }
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
            curve={0.8}
          />
          {/* AI 寫作夥伴：標題建議暫時停用，未來會重新啟用 */}
        </Field>

        {/* Story */}
        <Field
          label={t('storyLabel')}
          hint={
            storyState === 'short'
              ? t('storyMin', { count: storyLen })
              : storyState === 'ok'
                ? t('storyOk')
                : t('storyLong')
          }
          hintTone={storyState === 'ok' ? 'ok' : 'default'}
        >
          <MarkdownEditor
            value={story}
            onChange={setStory}
            placeholder={t('storyPlaceholder')}
            ariaLabel={t('storyLabel')}
            seed={17}
          />
          {/* AI 寫作夥伴：潤飾 diff 預覽暫時停用，未來會重新啟用 */}
        </Field>

        {/* Tags */}
        <Field label={t('tagsLabel')}>
          <div className={styles.tagRow}>
            {tags.map((tag) => (
              <TagPill
                key={tag}
                size="lg"
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
          {media ? (
            <HandDrawnImage
              src={media.url}
              alt={media.label ?? ''}
              seed={31}
              R={16}
              curve={0.8}
              onRemove={() => setMedia(undefined)}
              removeLabel={t('mediaRemove')}
            />
          ) : mediaBusy ? (
            <HandDrawnDashedSurface
              seed={31}
              R={16}
              curve={0.8}
              state="focus"
              className={styles.fileInputWrap}
            >
              <span className={styles.uploadInner}>
                <SketchLoader
                  size={64}
                  seed={31}
                  ariaLabel={generating ? t('mediaGenerating') : t('mediaUploading')}
                />
                <span className={styles.uploadText}>
                  {generating ? t('mediaGenerating') : t('mediaUploading')}
                </span>
              </span>
            </HandDrawnDashedSurface>
          ) : (
            // Split surface: drag/click upload on the left, AI generation on the
            // right, divided by a vertical pen rule.
            <HandDrawnDashedSurface
              seed={31}
              R={16}
              curve={0.8}
              state={dragOver ? 'focus' : 'idle'}
              className={styles.fileInputWrap}
            >
              <div className={styles.mediaSplit}>
                <label
                  className={styles.mediaHalf}
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
                  <span className={styles.uploadInner}>
                    <Icon name="image" size={26} color="var(--color-terracotta)" />
                    <span className={styles.uploadText}>{t('mediaPlaceholder')}</span>
                    <span className={styles.uploadHint}>{t('mediaHint')}</span>
                  </span>
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

                <Divider orientation="vertical" spacing={0} />

                <button
                  type="button"
                  className={styles.mediaHalf}
                  disabled={!canGenerate}
                  onClick={() => void generateFromStory()}
                  title={canGenerate ? undefined : t('mediaGenerateNeedStory')}
                >
                  <span className={styles.uploadInner}>
                    <Icon name="sparkle" size={26} color="var(--color-terracotta)" />
                    <span className={styles.uploadText}>{t('mediaGenerate')}</span>
                    <span className={styles.uploadHint}>
                      {canGenerate ? t('mediaGenerateHint') : t('mediaGenerateNeedStory')}
                    </span>
                  </span>
                </button>
              </div>
            </HandDrawnDashedSurface>
          )}
          {uploadError && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-terracotta)' }}>
              {uploadError}
            </div>
          )}
        </Field>

        {/* Visibility */}
        <Field label={t('visibility.label')}>
          {/* flex wrapper so the inline-flex bar shrinks to content instead of
              being stretched full-width by the Field's flex column */}
          <div style={{ display: 'flex' }}>
            <SegmentedActionBar
              segments={(['public', 'connections', 'private'] as Visibility[]).map((v) => {
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
                  fill: active ? 'oklch(92% 0.06 55 / 0.6)' : 'transparent',
                  textColor: active ? 'var(--color-terracotta)' : 'var(--color-text-muted)',
                  hoverOverlay: 'oklch(0% 0 0 / 0.05)',
                  ariaLabel: tVis(v),
                  onClick: () => setVisibility(v),
                } satisfies SegmentSpec;
              })}
            />
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

      {/*
        AI 寫作夥伴（暫時停用，未來會重新啟用）
        原本右側的 AI Assist Panel — 提供潤飾 / 標題 / 標籤建議。
        恢復時取消下方註解，並還原上方相關 state、handlers、imports（Panel / Divider / tAi）。

        <Panel
          title={<><Icon name="sparkle" size={16} color="var(--color-terracotta)" />{tAi('panel')}</>}
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
      */}
    </div>
  );
}

// AI 寫作夥伴：暫時停用，未來會重新啟用
// interface AiRowProps {
//   icon: 'sparkle' | 'star' | 'plus';
//   title: string;
//   hint: string;
//   onClick: () => void;
// }

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
        fillColor="transparent"
      />
      <span className={styles.addTagBody}>
        <Icon name="plus" size={12} /> {label}
      </span>
    </button>
  );
}

// AI 寫作夥伴：暫時停用，未來會重新啟用
// function AiRow({ icon, title, hint, onClick }: AiRowProps) {
//   return (
//     <button type="button" onClick={onClick} className={styles.aiRow}>
//       <span className={styles.aiRowTitle}>
//         <Icon name={icon} size={14} color="var(--color-terracotta)" />
//         {title}
//       </span>
//       <span className={styles.aiRowHint}>{hint}</span>
//     </button>
//   );
// }
