'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardDetailSkeleton } from '@/components/molecules/CardDetail/CardDetailSkeleton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { CardAuthorMetrics } from '@/components/molecules/CardDetail/CardAuthorMetrics';
import { CardAuthorAside } from '@/components/molecules/CardDetail/CardAuthorAside';
import { CardToc, type TocHeading } from '@/components/molecules/CardDetail/CardToc';
import { CardViewerActions } from '@/components/molecules/CardDetail/CardViewerActions';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { Link } from '@/i18n/navigation';
import { useCard, useRelated } from '@/lib/data/hooks';
import styles from './page.module.css';

const wrapStyle = {
  maxWidth: 'var(--page-max-w-wide)',
  margin: '0 auto',
  padding:
    'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
} as const;

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const locale = useLocale();
  const t = useTranslations('card');

  const { data, isLoading } = useCard(id);
  const { data: relatedData } = useRelated(id);

  const storyRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const story = data?.card?.story;

  // Derive the ToC from the rendered headings so the anchor ids match the ones
  // rehype-slug generated exactly.
  useEffect(() => {
    const root = storyRef.current;
    if (!root) {
      setHeadings([]);
      return;
    }
    const found = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2, h3')).map((el) => ({
      id: el.id,
      text: el.textContent ?? '',
      level: el.tagName === 'H2' ? (2 as const) : (3 as const),
    }));
    setHeadings(found.filter((h) => h.id));
  }, [story]);

  if (isLoading) {
    return (
      <div style={wrapStyle}>
        <CardDetailSkeleton />
      </div>
    );
  }

  // Loaded but no visible card (missing, private, or not permitted by rules).
  if (!data || !data.card || !data.author) {
    return (
      <div style={{ ...wrapStyle, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
          {t('notFound.title')}
        </p>
        <Link href="/home" style={{ textDecoration: 'none' }}>
          <span style={{ color: 'var(--color-terracotta)' }}>{t('notFound.back')}</span>
        </Link>
      </div>
    );
  }

  const { card, author } = data;
  const related = relatedData?.cards ?? [];
  const relatedAuthors = relatedData?.authors ?? {};
  const hue = card.accentHue ?? 55;

  return (
    <div style={wrapStyle}>
      <div className={styles.layout}>
        <article className={styles.article}>
          {/* Compact author header — shown inline only on mobile (the rail is
              hidden there). */}
          <header className={styles.mobileAuthor}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <HandDrawnAvatar
                initials={author.initials}
                size={44}
                color={author.accentColor}
                seed={Number(author.avatarSeed)}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Link
                    href={`/u/${author.handle}`}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      color: 'var(--color-text)',
                      textDecoration: 'none',
                    }}
                  >
                    {author.handle}
                  </Link>
                  {author.verified && <HandDrawnCheckmark size={13} title={t('verified')} />}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {author.region}
                  {card.publishedAt
                    ? ` · ${new Date(card.publishedAt).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}`
                    : ''}
                </div>
              </div>
            </div>
          </header>

          {card.media?.url && (
            <OrganicImage
              src={card.media.url}
              alt={card.media.label ?? card.thoughtCore}
              seed={hue + 11}
              ratio={0.52}
              className={styles.heroImage}
            />
          )}

          <h1 className={styles.title}>{card.thoughtCore}</h1>

          <div ref={storyRef} style={{ marginBottom: 32 }}>
            <StoryMarkdown source={card.story} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
            {card.tags.map((tag) => (
              <TagPill key={tag} color={`oklch(92% 0.06 ${hue})`}>
                {tag}
              </TagPill>
            ))}
          </div>

          <CardViewerActions
            cardId={card.id}
            author={{
              id: author.id,
              handle: author.handle,
              initials: author.initials,
              accentColor: author.accentColor,
            }}
          />

          <CardAuthorMetrics
            authorId={author.id}
            readCount={card.readCount}
            resonanceCount={card.resonanceCount}
            inviteCount={card.inviteCount}
          />
        </article>

        <aside className={styles.aside}>
          <CardAuthorAside author={author} verifiedLabel={t('verified')} />
          <CardToc headings={headings} title={t('toc')} />
        </aside>
      </div>

      {related.length > 0 && (
        <section
          style={{
            marginTop: 'clamp(20  px, 4vw, 40px)',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(22px, 2.6vw, 26px)',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--color-text)',
              margin: '0 0 clamp(28px, 3.5vw, 40px)',
              textAlign: 'center',
            }}
          >
            {t('related')}
          </h3>
          <CardLinkGrid cards={related} authors={relatedAuthors} />
        </section>
      )}
    </div>
  );
}
