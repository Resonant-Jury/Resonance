'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import {
  createCardDraft,
  publishCard,
  updateCardDraft,
} from '@/lib/db/firestore/client/cards';
import type { CardMedia, Visibility, Locale } from '@/lib/db/types';
import { useRouter } from '@/i18n/navigation';

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
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [polishPreview, setPolishPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
    try {
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
    } catch {
      return null;
    }
  }

  function submit() {
    start(async () => {
      const card = await saveDraft();
      if (!card) return;
      try {
        const published = await publishCard(card.id);
        router.push(`/card/${published.id}`);
      } catch {
        // surface in future error UI
      }
    });
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 32 }} className="editor-grid">
      <style>{`
        @media (max-width: 860px) {
          .editor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Core */}
        <div>
          <Label>{t('coreLabel')}</Label>
          <textarea
            value={thoughtCore}
            onChange={(e) => setThoughtCore(e.target.value.slice(0, 60))}
            placeholder={t('corePlaceholder')}
            rows={2}
            style={{
              ...inputStyle,
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          />
          <CharCount count={thoughtCore.length} max={60} />
          {titleSuggestions.length > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                background: 'oklch(94% 0.03 75 / 0.5)',
                fontSize: 14,
              }}
            >
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 8, fontSize: 12 }}>
                {tAi('title')}
              </div>
              {titleSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setThoughtCore(s);
                    setTitleSuggestions([]);
                  }}
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    border: 'none',
                    background: 'none',
                    color: 'var(--color-text)',
                    padding: '6px 0',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-heading)',
                    fontSize: 15,
                    width: '100%',
                  }}
                >
                  ✦ {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Story */}
        <div>
          <Label>{t('storyLabel')}</Label>
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder={t('storyPlaceholder')}
            rows={14}
            style={{ ...inputStyle, fontSize: 16, lineHeight: 1.7 }}
          />
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color:
                storyState === 'ok'
                  ? 'var(--color-sage, oklch(55% 0.13 140))'
                  : 'var(--color-text-muted)',
            }}
          >
            {storyState === 'short' && t('storyMin', { count: storyLen })}
            {storyState === 'ok' && t('storyOk')}
            {storyState === 'long' && t('storyLong')}
          </div>
          {polishPreview && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                background: 'oklch(92% 0.06 290 / 0.35)',
                fontSize: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{tAi('polish')} · diff 預覽</span>
                <button
                  onClick={() => setPolishPreview(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              </div>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-body)',
                  marginBottom: 10,
                }}
              >
                {polishPreview}
              </pre>
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
        </div>

        {/* Tags */}
        <div>
          <Label>{t('tagsLabel')}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => removeTag(tag)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <TagPill color="oklch(92% 0.075 88)">{tag} ✕</TagPill>
              </button>
            ))}
            <button
              onClick={suggestTags}
              style={{
                border: '1px dashed oklch(70% 0.04 60)',
                borderRadius: 999,
                padding: '4px 12px',
                background: 'none',
                color: 'var(--color-text-muted)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              + {t('tagsSuggest')}
            </button>
          </div>
        </div>

        {/* Media */}
        <div>
          <Label>{t('mediaLabel')}</Label>
          {media && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.url}
                alt={media.label ?? ''}
                style={{
                  width: 96,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 12,
                  border: '1px solid oklch(80% 0.02 75)',
                }}
              />
              <OrganicButton variant="ghost" onClick={() => setMedia(undefined)}>
                {t('mediaRemove')}
              </OrganicButton>
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void uploadImage(file);
              e.currentTarget.value = '';
            }}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px dashed oklch(70% 0.04 60)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
            }}
          />
          {uploadError && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-terracotta)' }}>
              {uploadError}
            </div>
          )}
        </div>

        {/* Visibility */}
        <div>
          <Label>{t('visibility.label')}</Label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['public', 'connections', 'private'] as Visibility[]).map((v) => {
              const active = visibility === v;
              return (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: active
                      ? '1.5px solid var(--color-terracotta)'
                      : '1px solid oklch(78% 0.03 75)',
                    background: active ? 'oklch(92% 0.06 55 / 0.5)' : 'transparent',
                    color: 'var(--color-text)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {tVis(v)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <OrganicButton
            variant="outline"
            onClick={() => {
              start(async () => {
                await saveDraft();
              });
            }}
          >
            {t('saveDraft')}
          </OrganicButton>
          <div style={{ opacity: pending ? 0.6 : 1, pointerEvents: pending ? 'none' : 'auto' }}>
            <OrganicButton variant="primary" onClick={submit}>
              {pending ? t('publishing') : t('publish')}
            </OrganicButton>
          </div>
          {autosavedLabel && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              ✿ {autosavedLabel}
            </span>
          )}
        </div>
      </div>

      {/* AI Assist Panel */}
      <aside
        style={{
          padding: 20,
          borderRadius: 20,
          background: 'oklch(94% 0.03 75 / 0.5)',
          alignSelf: 'start',
          position: 'sticky',
          top: 100,
        }}
      >
        <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 14 }}>
          ✦ {tAi('panel')}
        </h4>
        <AiRow title={tAi('polish')} hint={tAi('polishHint')} onClick={stubPolish} />
        <AiRow title={tAi('title')} hint={tAi('titleHint')} onClick={suggestTitles} />
        <AiRow title={tAi('tags')} hint={tAi('tagsHint')} onClick={suggestTags} />
        <p
          style={{
            marginTop: 14,
            fontSize: 11,
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
          }}
        >
          {tAi('stubNotice')}
        </p>
      </aside>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 14,
  border: '1px solid oklch(80% 0.02 75)',
  background: 'var(--color-cream)',
  fontFamily: 'var(--font-body)',
  color: 'var(--color-text)',
  resize: 'vertical' as const,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function CharCount({ count, max }: { count: number; max: number }) {
  return (
    <div
      style={{
        textAlign: 'right',
        fontSize: 11,
        color: count >= max ? 'var(--color-terracotta)' : 'var(--color-text-muted)',
        marginTop: 4,
      }}
    >
      {count} / {max}
    </div>
  );
}

function AiRow({
  title,
  hint,
  onClick,
}: {
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        background: 'var(--color-cream)',
        border: '1px solid oklch(82% 0.02 75)',
        cursor: 'pointer',
        textAlign: 'left',
        marginBottom: 10,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{hint}</div>
    </button>
  );
}
