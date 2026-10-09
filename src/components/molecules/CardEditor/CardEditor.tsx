'use client';

import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Field, Textarea, CharCount } from '@/components/atoms/Field/Field';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { HandDrawnImage } from '@/components/atoms/HandDrawnImage/HandDrawnImage';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { MarkdownEditor } from '@/components/molecules/MarkdownEditor/MarkdownEditor';
import { uploadImageFile } from '@/lib/images/upload';
import { extractAccentHue } from '@/lib/images/accentHue';
import { useRef } from 'react';
import { INK } from '@/lib/design/strokes';
// import { Panel } from '@/components/molecules/Panel/Panel'; // AI 寫作夥伴（暫停）
import { SegmentedActionBar } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { TagField } from '@/components/molecules/TagField/TagField';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';
import {
  createCardDraft,
  publishCard,
  updateCardDraft,
} from '@/lib/db/firestore/client/cards';
import {
  applyPendingCardEdit,
  discardPendingCardEdit,
  savePendingCardEdit,
} from '@/lib/db/firestore/client/cardEdits';
import type { Card, CardMedia, Visibility, Locale } from '@/lib/db/types';
import type { GenerateImageEvent } from '@/app/api/generate-image/route';
import { ndjsonValues } from '@/lib/streams/ndjson';
import { useRouter } from '@/i18n/navigation';
import { useLeaveWriter } from '@/lib/hooks/useLeaveWriter';
import { useConnectionRefresh } from '@/lib/data/resonate';
import styles from './CardEditor.module.css';

// The publish panel loads when it is first opened, not with the editor.
const PublishPanel = dynamic(() => import('@/components/molecules/PublishPanel/PublishPanel').then((m) => m.PublishPanel));

export interface CardEditorProps {
  initial?: {
    id?: string;
    /** URL slug of a published card — where saving an edit returns to. */
    slug?: string;
    /**
     * Set when this card is already live. Flips the editor from "writing a
     * draft" to "revising something people can read": autosave goes to the
     * private pending-edit buffer instead of the card, and the primary action
     * becomes 儲存修改 rather than 發布.
     */
    publishedAt?: Date | null;
    /** A working copy was already buffered for this published card. */
    hasPendingEdit?: boolean;
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
  /**
   * Reports the save state as ready-to-render copy ("草稿已自動儲存 · 14:32").
   * The host shows it beside the page title — the reassurance has to be
   * visible without scrolling to the bottom of the form.
   */
  onSaveStatusChange?: (label: string | null) => void;
  /** What the page around it asks as it goes (the writer's back arrow). */
  ref?: Ref<CardEditorHandle>;
}

/** What the writer's page asks of its editor before it leaves — the apps' WriteModel `hasWork` / `saveNow`. */
export interface CardEditorHandle {
  /**
   * Whether going back leaves something written behind (it is kept; the
   * writer is asked first): a new card or draft with words, a title, tags or
   * a cover in it that is kept (it has a draft) or is about to be; a live
   * card's revision, waiting in its buffer or typed and not saved yet. Words
   * the first-card guide seeded are the starting point, not writing: nothing
   * keeps them, so they count only once there is a draft. The apps'
   * `holdsWork`, rule for rule.
   */
  hasWork(): boolean;
  /** Writes what is on screen now, if it isn't yet — leaving doesn't wait out the debounce. */
  saveNow(): Promise<void>;
  /**
   * The card this editor writes: the one it was opened on, or — a fresh
   * /write — the draft its first save made; undefined before that.
   */
  cardId(): string | undefined;
}

// AI 寫作夥伴：暫時停用，未來會重新啟用
// const SAMPLE_TITLES = [
//   '有些話,寫下來,是為了自己先聽見。',
//   '被看見,比被喜歡更難得。',
//   '停下來看一件小事,是一種慢慢的勇敢。',
// ];

/** Everything a draft save writes, in one comparable shape. */
interface DraftValues {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  anonymous: boolean;
  media?: CardMedia;
  accentHue: number | null;
}

/** Canonical serialization — key order is fixed so equality is comparable. */
function draftSnapshot(v: DraftValues): string {
  return JSON.stringify({
    thoughtCore: v.thoughtCore,
    story: v.story,
    tags: v.tags,
    visibility: v.visibility,
    anonymous: v.anonymous,
    media: v.media,
    accentHue: v.accentHue,
  });
}

/** A draft with no content yet — autosave won't create a document for it. */
function isEmptyDraft(v: DraftValues): boolean {
  return !v.thoughtCore.trim() && !v.story.trim() && v.tags.length === 0 && !v.media;
}

/** How long editing must pause before the draft autosaves. */
const AUTOSAVE_DELAY_MS = 1500;

export function CardEditor({
  initial,
  locale,
  referenceCardId,
  mode = 'page',
  onPublished,
  onSavedDraft,
  onStoryChange,
  onSaveStatusChange,
  ref,
}: CardEditorProps) {
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  // const tAi = useTranslations('write.ai'); // AI 寫作夥伴：暫時停用
  const router = useRouter();
  const refreshConnections = useConnectionRefresh();
  // Back where the writer came from — or, in a tab of its own, to the card box, where the draft now is.
  const leaveWriter = useLeaveWriter('/me');
  const inline = mode === 'inline';

  const [thoughtCore, setThoughtCore] = useState(initial?.thoughtCore ?? '');
  const [story, setStory] = useState(initial?.story ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [publishOpen, setPublishOpen] = useState(false);
  const publishPanelLoaded = useOpenedOnce(publishOpen);
  const [media, setMedia] = useState<CardMedia | undefined>(initial?.media);
  // Cover-image dominant hue (snapped to the card palette). Recomputed when a
  // cover is uploaded/generated, cleared when removed — see setCover below.
  const [accentHue, setAccentHue] = useState<number | null>(initial?.accentHue ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // In-progress AI illustration (data URL) — the model streams 1–2 rough
  // passes before the final image, shown inside the busy media box.
  const [partialPreview, setPartialPreview] = useState<string | null>(null);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // AI 寫作夥伴：暫時停用，未來會重新啟用
  // const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  // const [polishPreview, setPolishPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Revising a live card: the primary action saves changes rather than
  // publishing, and autosave buffers instead of writing through. Fixed for the
  // editor's lifetime — the host remounts it when the route's card changes.
  const isPublished = initial?.publishedAt != null;
  const [hasPendingEdit, setHasPendingEdit] = useState(initial?.hasPendingEdit ?? false);

  useEffect(() => {
    onStoryChange?.(story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);

  // ---- Autosave ---------------------------------------------------------
  // Work persists on its own shortly after editing pauses, so backing out of
  // the editor is always safe. *Where* it persists depends on the card:
  //   • a draft writes straight to its own document — nobody can read it yet;
  //   • a published card writes to its private pending-edit buffer, so a
  //     half-finished revision never reaches the people already reading it.
  // Everything the save needs travels through refs so the debounce timer, the
  // unmount flush, and the publish path all write the same latest values.
  const draftIdRef = useRef(initial?.id);
  const values: DraftValues = { thoughtCore, story, tags, visibility, anonymous, media, accentHue };
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const lastSavedRef = useRef(
    draftSnapshot({
      thoughtCore: initial?.thoughtCore ?? '',
      story: initial?.story ?? '',
      tags: initial?.tags ?? [],
      visibility: initial?.visibility ?? 'public',
      anonymous: initial?.anonymous ?? false,
      media: initial?.media,
      accentHue: initial?.accentHue ?? null,
    }),
  );
  // All draft writes queue on one chain so an in-flight autosave can never
  // race the publish path into creating a second document.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  // Set once the editor is done with this card (saved or discarded): the
  // unmount flush must not resurrect a buffer we just cleared.
  const closedRef = useRef(false);

  /**
   * One line of plain reassurance, shown next to the page title (never only at
   * the bottom of the form — the whole confusion was people not knowing their
   * writing was safe). It says both what has happened and, for a live card,
   * what has *not* happened yet. A draft says nothing until its first save.
   */
  const saveStatusLabel = useMemo(() => {
    if (inline) return null;
    const time = savedAt?.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (isPublished) {
      if (savedAt) return t('editBuffered', { time: time! });
      return hasPendingEdit ? t('editBufferedIdle') : t('editLiveHint');
    }
    return savedAt ? t('autosaved', { time: time! }) : null;
  }, [savedAt, hasPendingEdit, isPublished, inline, locale, t]);

  useEffect(() => {
    onSaveStatusChange?.(saveStatusLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatusLabel]);

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
      // The field stays open while the model thinks, so merge into what is
      // there now, not into the list this request started from.
      setTags((now) => {
        const fresh = (suggested ?? []).filter((x) => !now.includes(x));
        return fresh.length > 0 ? [...now, ...fresh] : now;
      });
    } catch (err) {
      console.error('Tag suggestion failed:', err);
      setTagError(t('tagsSuggestError'));
    } finally {
      setSuggestingTags(false);
    }
  }

  // AI 寫作夥伴：暫時停用，未來會重新啟用
  // function suggestTitles() {
  //   setTitleSuggestions(SAMPLE_TITLES);
  // }
  // function stubPolish() {
  //   setPolishPreview(story.replace(/\n{3,}/g, '\n\n').trim());
  // }

  /** Publish-time choices arrive from the publish panel, ahead of state. */
  interface PublishChoices {
    visibility?: Visibility;
    anonymous?: boolean;
  }

  /** The editable body, in the shape both the card doc and the buffer take. */
  function payloadFrom(v: DraftValues) {
    return {
      thoughtCore: v.thoughtCore,
      story: v.story,
      tags: v.tags,
      visibility: v.visibility,
      media: v.media,
      accentHue: v.accentHue,
      anonymous: v.anonymous,
    };
  }

  /** Current values, with any publish/update panel choices layered on top. */
  function currentValues(choices?: PublishChoices): DraftValues {
    return {
      ...valuesRef.current,
      visibility: choices?.visibility ?? valuesRef.current.visibility,
      anonymous: choices?.anonymous ?? valuesRef.current.anonymous,
    };
  }

  /**
   * Persist the working copy. Returns the card for a draft (the caller may
   * need its freshly minted id); a published card's edits land in the buffer,
   * which has no card to hand back — hence `null`.
   */
  function saveDraft(choices?: PublishChoices): Promise<Card | null> {
    const run = writeChainRef.current.then(async () => {
      const v = currentValues(choices);
      const payload = payloadFrom(v);
      if (isPublished && draftIdRef.current) {
        await savePendingCardEdit(draftIdRef.current, payload);
        setHasPendingEdit(true);
        lastSavedRef.current = draftSnapshot(v);
        setSavedAt(new Date());
        return null;
      }
      const card = draftIdRef.current
        ? await updateCardDraft(draftIdRef.current, payload)
        : await createCardDraft({ ...payload, originalLocale: locale, referenceCardId });
      if (!draftIdRef.current && !inline) {
        // First save of a fresh draft: swap /write for /write/{id} in place
        // (Next integrates native replaceState) so a reload or a later
        // traversal reopens this draft instead of a blank editor.
        const path = window.location.pathname;
        const next = path.replace(/\/write(\/[^/]+)?$/, `/write/${card.id}`);
        if (next !== path) {
          const base = (window.history.state ?? {}) as Record<string, unknown>;
          window.history.replaceState(base, '', next);
        }
      }
      draftIdRef.current = card.id;
      lastSavedRef.current = draftSnapshot(v);
      setSavedAt(new Date());
      return card;
    });
    writeChainRef.current = run.catch(() => undefined);
    return run;
  }

  /** What is on screen differs from what was last written, and is worth writing (a blank new card isn't). */
  function needsSave(): boolean {
    const v = valuesRef.current;
    return draftSnapshot(v) !== lastSavedRef.current && !(!draftIdRef.current && isEmptyDraft(v));
  }

  // Kick a save if the current values differ from what was last written.
  // Failures stay silent (logged) — the state remains dirty, so the next
  // pause or the publish path retries.
  function autosaveNow() {
    if (closedRef.current || !needsSave()) return;
    void saveDraft().catch((err) => console.error('Autosave failed:', err));
  }
  const autosaveNowRef = useRef(autosaveNow);
  autosaveNowRef.current = autosaveNow;

  // Debounce: save AUTOSAVE_DELAY_MS after the last edit. Inline (resonance)
  // composers keep their explicit publish/save buttons instead.
  useEffect(() => {
    if (inline) return;
    const h = setTimeout(() => autosaveNowRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(h);
  }, [thoughtCore, story, tags, visibility, anonymous, media, accentHue, inline]);

  // Edits younger than the debounce flush when the editor unmounts (in-app
  // back/navigation keeps the JS context alive, so the async write completes)
  // and when the tab is backgrounded — the closest signal mobile gives before
  // being killed.
  useEffect(() => {
    if (inline) return;
    const flush = () => autosaveNowRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [inline]);

  async function submit(choices?: PublishChoices) {
    if (pending) return;
    setPending(true);
    setPublishError(null);
    try {
      const card = await saveDraft(choices);
      if (!card) throw new Error('Draft was not saved');
      // One server call publishes it (POST /api/v1/cards/{id}/publish, as the
      // apps do): it stamps the card once, gives it its English URL slug (the
      // id stands in if that AI step fails — publishing never fails for it),
      // and for a resonance's first publish connects the two authors and
      // rings the original author's bell — never for an anonymous one, whose
      // connection would name its author. The recommendation index and the
      // card page's cache are refreshed after the response.
      const published = await publishCard(card.id);
      const destination = published.slug ?? published.id;
      // Inline (resonance) mode stays on the page so the resonance section can
      // refresh in place; the page editor navigates to the new card.
      if (inline) {
        onPublished?.({ ...card, publishedAt: card.publishedAt ?? new Date(), slug: published.slug ?? card.slug });
      } else {
        router.push(`/card/${destination}`);
      }
    } catch (err) {
      console.error('Publish failed:', err);
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  /** Where a published card's editor returns to. */
  const cardHref = `/card/${initial?.slug ?? draftIdRef.current ?? initial?.id ?? ''}`;

  /**
   * Merge the buffered revision into the live card. This — not autosave — is
   * the moment an edit becomes visible to readers. One server call does it
   * (POST /api/v1/cards/{id}/edits/apply, as the apps do), from the buffer:
   * so the working copy on screen, with the panel's choices, is written there
   * first. `publishedAt` and the slug are left alone (updating a card is not
   * re-publishing it); the cached pages and the recommendation index are
   * refreshed after the response.
   */
  async function applyUpdate(choices?: PublishChoices) {
    const id = draftIdRef.current;
    if (pending || !id) return;
    // The server refuses a card without a title; say so in the writer's words.
    if (!valuesRef.current.thoughtCore.trim()) {
      setPublishError(t('titleRequired'));
      return;
    }
    setPending(true);
    setPublishError(null);
    try {
      // The save queues behind any in-flight autosave and the apply behind the
      // save, so no straggling write can re-create the buffer after it's gone.
      // A failed save never reaches the apply.
      const run = saveDraft(choices).then(() => applyPendingCardEdit(id));
      writeChainRef.current = run.catch(() => undefined);
      const result = await run;
      if (!result.applied) {
        // The buffer was gone by then (applied or discarded elsewhere), so the
        // text on screen may not be live and is kept nowhere: mark it unsaved,
        // so a retry, autosave or leaving writes it again.
        lastSavedRef.current = '';
        throw new Error('Changes were not applied');
      }
      setHasPendingEdit(false);
      closedRef.current = true;
      // A resonance these changes hid or unnamed was taken back with them: the connection with the original's
      // author may have ended, so what turns on the viewer's connections is read again.
      if (referenceCardId) refreshConnections();
      router.push(`/card/${result.slug ?? initial?.slug ?? id}`);
    } catch (err) {
      console.error('Save changes failed:', err);
      closedRef.current = false;
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  /** Throw the buffered revision away; the live card was never touched. */
  async function discardEdits() {
    const id = draftIdRef.current;
    if (pending || !id) return;
    setPending(true);
    setPublishError(null);
    try {
      const run = writeChainRef.current.then(() => discardPendingCardEdit(id));
      writeChainRef.current = run.catch(() => undefined);
      await run;
      setHasPendingEdit(false);
      closedRef.current = true;
      router.push(cardHref);
    } catch (err) {
      console.error('Discard edits failed:', err);
      closedRef.current = false;
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  /**
   * The explicit way out of a draft. Autosave already makes leaving safe, but
   * "just close the window" is not something anyone should have to infer —
   * this gives the intent a button to land on.
   */
  async function saveDraftAndLeave() {
    if (pending) return;
    setPending(true);
    setPublishError(null);
    try {
      if (needsSave()) await saveDraft();
      closedRef.current = true;
      leaveWriter();
    } catch (err) {
      console.error('Save draft failed:', err);
      closedRef.current = false;
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  useImperativeHandle(ref, () => ({
    hasWork() {
      const v = valuesRef.current;
      const unsaved = draftSnapshot(v) !== lastSavedRef.current;
      if (isPublished) return hasPendingEdit || unsaved;
      return !isEmptyDraft(v) && (draftIdRef.current != null || unsaved);
    },
    async saveNow() {
      if (!closedRef.current && needsSave()) await saveDraft();
    },
    cardId() {
      return draftIdRef.current;
    },
  }));

  const mediaBusy = uploading || generating;
  const canGenerate = story.trim().length > 0 && !mediaBusy;

  async function generateFromStory() {
    if (mediaBusy || story.trim().length === 0) return;
    setUploadError(null);
    setGenerating(true);
    setPartialPreview(null);
    try {
      // The story body lives only in editor state here (the draft may be
      // unsaved), so send it to the server, which distills it into an imagery
      // prompt, renders the doodle, stores it in R2, and returns the URL. The
      // response is an NDJSON stream: in-progress previews arrive as `partial`
      // events while the model paints, then `done` carries the stored URL.
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      if (!res.ok || !res.body) {
        setUploadError(t('mediaGenerateError'));
        return;
      }
      let finalUrl: string | null = null;
      for await (const event of ndjsonValues<GenerateImageEvent>(res.body)) {
        if (event.type === 'partial') {
          setPartialPreview(`data:image/png;base64,${event.b64}`);
        } else if (event.type === 'done') {
          finalUrl = event.publicUrl;
        } else if (event.type === 'error') {
          setUploadError(t('mediaGenerateError'));
          return;
        }
      }
      if (!finalUrl) {
        setUploadError(t('mediaGenerateError'));
        return;
      }
      setMedia({ type: 'image', url: finalUrl, label: t('mediaGeneratedLabel') });
      setAccentHue(await extractAccentHue(finalUrl));
    } catch {
      setUploadError(t('mediaGenerateError'));
    } finally {
      setGenerating(false);
      setPartialPreview(null);
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
            autoGrow
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
        <Field label={t('tagsLabel')} htmlFor="card-tags">
          <TagField
            id="card-tags"
            tags={tags}
            onChange={setTags}
            onSuggest={() => void suggestTags()}
            suggesting={suggestingTags}
            error={tagError}
          />
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
            partialPreview ? (
              // The model's in-progress pass: shown straight inside the same
              // hand-drawn frame (identical seed/geometry + final aspect
              // ratio) the stored image will land in, gaussian-blurred and
              // washed because it isn't a settled picture yet.
              <HandDrawnImage
                src={partialPreview}
                seed={31}
                R={16}
                curve={0.8}
                blur={14}
                wash="color-mix(in oklch, var(--color-cream) 45%, transparent)"
              >
                <span className={styles.generatingOverlay}>
                  <SketchLoader size={64} seed={31} ariaLabel={t('mediaGenerating')} />
                  <span className={styles.uploadText}>{t('mediaGenerating')}</span>
                </span>
              </HandDrawnImage>
            ) : (
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
            )
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
                  fill: 'var(--button-fill)',
                  hoverOverlay: 'oklch(0% 0 0 / 0.14)',
                  onClick: () => void submit(),
                },
                {
                  key: 'draft',
                  icon: <Icon name="pen" size={16} />,
                  label: tCard('saveResonanceDraft'),
                  onClick: () => {
                    if (pending) return;
                    setPending(true);
                    setPublishError(null);
                    saveDraft()
                      .then((card) => card && onSavedDraft?.(card))
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
        <div className={`${styles.actions} ${styles.actionsStack}`}>
          {/* Everything autosaves; these buttons are only about *intent*.
              A draft: publish it, or step away and come back later. A live
              card: put the revision in front of readers, or drop it. On a
              phone they are one centred column: the verb across the width,
              the quiet way out under it. */}
          <div className={styles.primaryAction} data-pending={pending || undefined}>
            <OrganicButton
              variant="primary"
              onClick={() => {
                setPublishError(null);
                setPublishOpen(true);
              }}
            >
              {isPublished
                ? pending
                  ? t('saving')
                  : t('saveChanges')
                : pending
                ? t('publishing')
                : t('publish')}
            </OrganicButton>
          </div>
          {(isPublished ? hasPendingEdit : true) && (
            <div className={styles.secondaryAction} data-pending={pending || undefined}>
              <OrganicButton
                variant="text"
                onClick={() => void (isPublished ? discardEdits() : saveDraftAndLeave())}
              >
                {isPublished ? t('discardChanges') : t('saveDraftAndLeave')}
              </OrganicButton>
            </div>
          )}
          {publishError && !publishOpen && (
            <span className={styles.actionError}>{publishError}</span>
          )}
          {/* The save state used to live here and nowhere else, which is why
              nobody found it. It now sits under the page title
              (`onSaveStatusChange`); a second copy beside the buttons would
              just be the same sentence twice on one screen. */}
        </div>
        )}

        {!inline && publishPanelLoaded && (
          <PublishPanel
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            mode={isPublished ? 'update' : 'publish'}
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
              if (isPublished) void applyUpdate(choices);
              else void submit(choices);
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
