'use client';

import { useEffect, useId, useMemo, useState, type MouseEvent } from 'react';
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
import { uploadImageFile } from '@/lib/images/upload';
import { extractAccentHue } from '@/lib/images/accentHue';
import { useRef } from 'react';
import { INK } from '@/lib/design/strokes';
// import { Panel } from '@/components/molecules/Panel/Panel'; // AI 寫作夥伴（暫停）
import {
  SegmentedActionBar,
  boundaryPoints,
  polyline,
} from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { PublishPanel } from '@/components/molecules/PublishPanel/PublishPanel';
import { Modal } from '@/components/molecules/Modal/Modal';
import { wobRect } from '@/lib/design/wobRect';
import {
  createCardDraft,
  publishCard,
  updateCardDraft,
} from '@/lib/db/firestore/client/cards';
import { ensureConnection } from '@/lib/db/firestore/client/connections';
import { getCurrentUserHandle } from '@/lib/db/firestore/client/profile';
import { getCardById } from '@/lib/db/firestore/client/reads';
import { notifyResonance } from '@/lib/db/firestore/client/resonances';
import type { Card, CardMedia, Visibility, Locale } from '@/lib/db/types';
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
    accentHue?: number;
    anonymous?: boolean;
  };
  locale: Locale;
  /**
   * When set, the created/updated card references this card (a "resonance"
   * response card). Forwarded to {@link createCardDraft}.
   */
  referenceCardId?: string;
  /**
   * `'page'` (default) is the full Write page: outline buttons + slug redirect
   * on publish. `'inline'` is the embedded resonance composer: hides the
   * visibility selector (always public), shows a 公開發表 / 存草稿 segmented bar,
   * and reports results via callbacks instead of navigating away.
   */
  mode?: 'page' | 'inline';
  /** Called after a successful publish (inline mode). */
  onPublished?: (card: Card) => void;
  /** Called after a successful draft save (inline mode). */
  onSavedDraft?: (card: Card) => void;
  /**
   * Reports the story text as it is typed. Lets a wrapper offer exits that
   * carry the draft along (e.g. the resonance editor's「寄給作者就好」downgrade
   * into a private note).
   */
  onStoryChange?: (story: string) => void;
}

// AI 寫作夥伴：暫時停用，未來會重新啟用
// const SAMPLE_TITLES = [
//   '有些話,寫下來,是為了自己先聽見。',
//   '被看見,比被喜歡更難得。',
//   '停下來看一件小事,是一種慢慢的勇敢。',
// ];

export function CardEditor({
  initial,
  locale,
  referenceCardId,
  mode = 'page',
  onPublished,
  onSavedDraft,
  onStoryChange,
}: CardEditorProps) {
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  // const tAi = useTranslations('write.ai'); // AI 寫作夥伴：暫時停用
  const router = useRouter();
  const inline = mode === 'inline';

  const [thoughtCore, setThoughtCore] = useState(initial?.thoughtCore ?? '');
  const [story, setStory] = useState(initial?.story ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [media, setMedia] = useState<CardMedia | undefined>(initial?.media);
  // Cover-image dominant hue (snapped to the card palette). Recomputed when a
  // cover is uploaded/generated, cleared when removed — see setCover below.
  const [accentHue, setAccentHue] = useState<number | null>(initial?.accentHue ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // AI 寫作夥伴：暫時停用，未來會重新啟用
  // const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  // const [polishPreview, setPolishPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingLeaveUrl, setPendingLeaveUrl] = useState<string | undefined>(undefined);
  const [isBrowserBack, setIsBrowserBack] = useState(false);
  const allowLeaveRef = useRef(false);

  const isDirty = useMemo(() => {
    if (inline) return false;
    const isCoreChanged = thoughtCore !== (initial?.thoughtCore ?? '');
    const isStoryChanged = story !== (initial?.story ?? '');
    const isTagsChanged = JSON.stringify(tags) !== JSON.stringify(initial?.tags ?? []);
    const isVisibilityChanged = visibility !== (initial?.visibility ?? 'public');
    const isAnonymousChanged = anonymous !== (initial?.anonymous ?? false);
    const isMediaChanged = JSON.stringify(media) !== JSON.stringify(initial?.media);
    return isCoreChanged || isStoryChanged || isTagsChanged || isVisibilityChanged || isAnonymousChanged || isMediaChanged;
  }, [thoughtCore, story, tags, visibility, anonymous, media, initial, inline]);

  useEffect(() => {
    if (inline) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !allowLeaveRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, inline]);

  useEffect(() => {
    if (inline) return;
    const handleAnchorClick = (e: globalThis.MouseEvent) => {
      if (!isDirty || allowLeaveRef.current) return;
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && (href.startsWith('/') || href.startsWith(window.location.origin))) {
          const targetAttr = anchor.getAttribute('target');
          if (targetAttr === '_blank') return;
          e.preventDefault();
          e.stopPropagation();
          setPendingLeaveUrl(href);
          setIsBrowserBack(false);
          setShowLeaveConfirm(true);
        }
      }
    };
    document.addEventListener('click', handleAnchorClick, true);
    return () => {
      document.removeEventListener('click', handleAnchorClick, true);
    };
  }, [isDirty, inline]);

  useEffect(() => {
    if (inline || !isDirty) return;
    window.history.pushState({ guard: true }, '', window.location.href);
    const handlePopState = () => {
      if (allowLeaveRef.current) return;
      if (isDirty) {
        window.history.pushState({ guard: true }, '', window.location.href);
        setIsBrowserBack(true);
        setPendingLeaveUrl(undefined);
        setShowLeaveConfirm(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state && window.history.state.guard) {
        allowLeaveRef.current = true;
        window.history.back();
      }
    };
  }, [isDirty, inline]);

  const onConfirmLeave = () => {
    allowLeaveRef.current = true;
    setShowLeaveConfirm(false);
    if (isBrowserBack) {
      window.history.go(-2);
    } else if (pendingLeaveUrl) {
      router.push(pendingLeaveUrl);
    }
  };

  const onCancelLeave = () => {
    setShowLeaveConfirm(false);
  };

  useEffect(() => {
    onStoryChange?.(story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);

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

  async function suggestTags() {
    if (suggestingTags) return;
    setTagError(null);
    setSuggestingTags(true);
    try {
      // The draft may be unsaved, so the editor state travels in the body. The
      // server merges in the author's past tags before asking the model.
      const res = await fetch('/api/cards/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thoughtCore, story, tags }),
      });
      if (!res.ok) throw new Error(`Tag suggestion failed: ${res.status}`);
      const { tags: suggested } = (await res.json()) as { tags?: string[] };
      const fresh = (suggested ?? []).filter((x) => !tags.includes(x));
      if (fresh.length > 0) setTags([...tags, ...fresh]);
    } catch (err) {
      console.error('Tag suggestion failed:', err);
      setTagError(t('tagsSuggestError'));
    } finally {
      setSuggestingTags(false);
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) return;
    setTags([...tags, tag]);
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

  /** Publish-time choices arrive from the publish panel, ahead of state. */
  interface PublishChoices {
    visibility?: Visibility;
    anonymous?: boolean;
  }

  async function saveDraft(choices?: PublishChoices) {
    const vis = choices?.visibility ?? visibility;
    const anon = choices?.anonymous ?? anonymous;
    const card = initial?.id
      ? await updateCardDraft(initial.id, { thoughtCore, story, tags, visibility: vis, media, accentHue, anonymous: anon })
      : await createCardDraft({
        thoughtCore,
        story,
        tags,
        visibility: vis,
        originalLocale: locale,
        media,
        accentHue,
        referenceCardId,
        anonymous: anon,
      });
    setSavedAt(new Date());
    return card;
  }

  async function submit(choices?: PublishChoices) {
    if (pending) return;
    setPending(true);
    setPublishError(null);
    try {
      const card = await saveDraft(choices);
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
      // Fire-and-forget: build the card's recommendation index (insight
      // signature + vectors). Deliberately not awaited — publishing must never
      // block on the AI step, and a failure here just means the card gets
      // indexed on a later edit.
      void fetch('/api/cards/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: published.id }),
      }).catch(() => {});
      // 共振 reaches out: connect the two authors right away and ring the
      // original author's bell. Skipped for anonymous resonances — a
      // connection doc names both uids, which would unmask the author.
      if (referenceCardId && !(choices?.anonymous ?? anonymous)) {
        void (async () => {
          const original = await getCardById(referenceCardId);
          if (!original) return;
          await ensureConnection(original.authorId).catch(() => {});
          const fromHandle = (await getCurrentUserHandle().catch(() => null)) ?? '';
          await notifyResonance(referenceCardId, { authorId: original.authorId, fromHandle });
        })().catch(() => {});
      }
      // Inline (resonance) mode stays on the page so the resonance section can
      // refresh in place; the page editor navigates to the new card.
      if (inline) {
        onPublished?.({ ...published, slug: destination === published.id ? published.slug : destination });
      } else {
        allowLeaveRef.current = true;
        router.push(`/card/${destination}`);
      }
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
      setAccentHue(await extractAccentHue(publicUrl));
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
      const { publicUrl } = await uploadImageFile(file);
      setMedia({ type: 'image', url: publicUrl, label: file.name });
      // Read the hue from the local file — no extra fetch, no CORS involved.
      setAccentHue(await extractAccentHue(file));
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
        <Field label={t('storyLabel')}>
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
          <div className={styles.tagBlock}>
            <div className={styles.tagRow}>
              {tags.map((tag) => (
                <TagPill
                  key={tag}
                  size="lg"
                  color="var(--color-terracotta-light)"
                  onRemove={() => removeTag(tag)}
                >
                  {tag}
                </TagPill>
              ))}
              {/* The AI pill steps aside once the user starts typing their own tag. */}
              {!tagDraft.trim() && (
                <AddTagButton
                  label={suggestingTags ? t('tagsSuggesting') : t('tagsSuggest')}
                  onClick={() => void suggestTags()}
                />
              )}
            </div>
            <TagInput
              value={tagDraft}
              onChange={setTagDraft}
              placeholder={t('tagsPlaceholder')}
              addLabel={t('tagsAdd')}
              onAdd={addTag}
            />
            {tagError && <div className={styles.tagError}>{tagError}</div>}
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
              onRemove={() => { setMedia(undefined); setAccentHue(null); }}
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

                <Divider orientation="vertical" spacing={0} strokeWidth={INK} />

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

        {/* Visibility now lives in the publish panel (ux §6) — the page editor
            body stays about the writing; resonance (inline) cards are always
            public and never see the panel. */}

        {/* Actions */}
        {inline ? (
          <div className={styles.actions}>
            <SegmentedActionBar
              segments={[
                {
                  key: 'publish',
                  icon: <Icon name="wave" size={16} color="var(--color-cream)" />,
                  label: pending ? t('publishing') : tCard('publishResonance'),
                  textColor: 'var(--color-cream)',
                  fill: 'var(--color-terracotta)',
                  hoverOverlay: 'oklch(0% 0 0 / 0.14)',
                  onClick: () => void submit(),
                },
                {
                  key: 'draft',
                  icon: <Icon name="pen" size={16} color="var(--color-terracotta)" />,
                  label: tCard('saveResonanceDraft'),
                  onClick: () => {
                    if (pending) return;
                    setPending(true);
                    setPublishError(null);
                    saveDraft()
                      .then((card) => onSavedDraft?.(card))
                      .catch((err) => {
                        console.error('Save draft failed:', err);
                        setPublishError(err instanceof Error ? err.message : String(err));
                      })
                      .finally(() => setPending(false));
                  },
                },
              ]}
            />
            {publishError && (
              <span style={{ fontSize: 12, color: 'var(--color-terracotta)' }}>{publishError}</span>
            )}
          </div>
        ) : (
        <div className={styles.actions}>
          <OrganicButton
            variant="outline"
            onClick={() => {
              if (pending) return;
              setPending(true);
              setPublishError(null);
              saveDraft()
                .then((card) => {
                  if (!initial?.id && mode === 'page') {
                    allowLeaveRef.current = true;
                    router.replace(`/write/${card.id}`);
                  }
                })
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
            <OrganicButton
              variant="primary"
              onClick={() => {
                setPublishError(null);
                setPublishOpen(true);
              }}
            >
              {pending ? t('publishing') : t('publish')}
            </OrganicButton>
          </div>
          {publishError && !publishOpen && (
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
        )}

        {!inline && (
          <PublishPanel
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            thoughtCore={thoughtCore}
            story={story}
            initialVisibility={visibility}
            initialAnonymous={anonymous}
            pending={pending}
            error={publishError}
            onPublish={(choices) => {
              // Keep editor state in sync so a failed publish (panel stays
              // open) retries with the same choices.
              setVisibility(choices.visibility);
              setAnonymous(choices.anonymous);
              void submit(choices);
            }}
          />
        )}
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
      {showLeaveConfirm && (
        <Modal
          open={showLeaveConfirm}
          onClose={onCancelLeave}
          maxWidth={400}
          ariaLabel={t('discard.title')}
        >
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, marginBottom: 12 }}>
              {t('discard.title')}
            </h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
              {t('discard.message')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <OrganicButton variant="outline" size="sm" onClick={onCancelLeave}>
                {t('discard.cancel')}
              </OrganicButton>
              <OrganicButton variant="primary" size="sm" onClick={onConfirmLeave}>
                {t('discard.confirm')}
              </OrganicButton>
            </div>
          </div>
        </Modal>
      )}
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

// Seed for the tag input bar's wobble — module-scoped so the shape is stable
// across renders and SSR/CSR.
const TAG_BAR_SEED = 53;

/**
 * Tag input styled like a two-segment SegmentedActionBar: the left segment is
 * the text input, the right segment is the add action — one shared wobbly
 * border, a wavy vertical divider (same geometry helpers as the bar), the
 * action segment washed with the light theme tint and a pointer-anchored
 * pour-paint hover reveal.
 */
function TagInput({
  value,
  onChange,
  placeholder,
  addLabel,
  onAdd,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  addLabel: string;
  onAdd: (tag: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(barRef, 480, 50);
  const { w: btnW } = useElementSize(btnRef, 96, 50);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const maskId = useId().replace(/:/g, '');
  const canAdd = value.trim().length > 0;

  function commit() {
    if (!canAdd) return;
    onAdd(value);
    onChange('');
  }

  const pad = h > 0 ? Math.max(12, h * 0.3) : 0;
  const outerPath = useMemo(() => {
    if (!w || !h) return '';
    // Same wobble recipe as SegmentedActionBar so both read as one family.
    return wobRect(w, h, 16, TAG_BAR_SEED, Math.min(w, h) * 0.05, {
      segmentsH: [7, 9],
      segmentsV: [2, 3],
      curve: 1.2,
      cornerJitter: 1.2,
      cornerOffset: h * 0.04,
    });
  }, [w, h]);
  const boundary = useMemo(
    () => (w && h && btnW ? boundaryPoints(w - btnW, h, TAG_BAR_SEED + 11, 1.6, pad) : null),
    [w, h, btnW, pad],
  );
  // Action segment region: wavy left edge shared with the divider stroke,
  // straight overshot outer edges trimmed flush by the clip.
  const actionRegion = boundary
    ? `M ${boundary[0][0]},${boundary[0][1]} ` +
      boundary.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ') +
      ` L ${w + pad},${h + pad} L ${w + pad},${-pad} Z`
    : '';

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const maxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 4;

  // Still a form field: border follows the field state tokens; the divider
  // matches the border so the bar reads as one drawn shape.
  const stroke = focus
    ? 'var(--field-border-focus)'
    : hover
    ? 'var(--field-border-hover)'
    : 'var(--field-border)';

  return (
    <div
      ref={barRef}
      className={styles.tagInputBar}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {w > 0 && h > 0 && (
        <svg
          aria-hidden="true"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className={`${styles.tagInputBackdrop} res-shape-fade-in`}
        >
          <defs>
            <clipPath id={`tag-bar-clip-${maskId}`}>
              <path d={outerPath} />
            </clipPath>
            <mask
              id={`tag-bar-hover-${maskId}`}
              maskUnits="userSpaceOnUse"
              x={-w} y={-h} width={w * 3} height={h * 3}
            >
              <circle
                cx={pos.x} cy={pos.y}
                r={btnHover && canAdd ? maxR : 0}
                fill="white"
                style={{ transition: 'r 340ms linear' }}
              />
            </mask>
          </defs>
          <g clipPath={`url(#tag-bar-clip-${maskId})`}>
            <path d={outerPath} fill="var(--color-cream)" />
            {actionRegion && (
              <path
                d={actionRegion}
                fill="color-mix(in oklch, var(--color-terracotta-light) 60%, transparent)"
              />
            )}
            {actionRegion && (
              <g mask={`url(#tag-bar-hover-${maskId})`}>
                <path
                  d={actionRegion}
                  fill="color-mix(in oklch, var(--color-terracotta) 13%, transparent)"
                />
              </g>
            )}
          </g>
          {boundary && (
            <path
              d={polyline(boundary)}
              fill="none"
              stroke={stroke}
              strokeWidth={INK}
              strokeLinecap="round"
              clipPath={`url(#tag-bar-clip-${maskId})`}
            />
          )}
          <path d={outerPath} fill="none" stroke={stroke} strokeWidth={INK} strokeLinejoin="round" />
        </svg>
      )}
      <input
        type="text"
        className={styles.tagInputField}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      />
      <button
        ref={btnRef}
        type="button"
        className={styles.tagInputBtn}
        disabled={!canAdd}
        onClick={commit}
        onMouseEnter={(e) => { recordPointer(e); setBtnHover(true); }}
        onMouseMove={recordPointer}
        onMouseLeave={() => setBtnHover(false)}
      >
        <Icon name="plus" size={12} /> {addLabel}
      </button>
    </div>
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
