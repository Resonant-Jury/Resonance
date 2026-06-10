'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardDetailSkeleton } from '@/components/molecules/CardDetail/CardDetailSkeleton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { CardAuthorAside } from '@/components/molecules/CardDetail/CardAuthorAside';
import { CardToc, type TocHeading } from '@/components/molecules/CardDetail/CardToc';
import { CardActionsMenu } from '@/components/molecules/CardActionsMenu/CardActionsMenu';
import { CardViewerActions } from '@/components/molecules/CardDetail/CardViewerActions';
import { ResonanceCards } from '@/components/molecules/CardDetail/ResonanceCards';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { useSWRConfig } from 'swr';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCard, useLinkedToCard, useRelated, useResonanceCards, useReferencedCard } from '@/lib/data/hooks';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import styles from './page.module.css';

const wrapStyle = {
  maxWidth: 'var(--page-max-w-wide)',
  margin: '0 auto',
  padding:
    'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
} as const;

export default function CardDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const locale = useLocale();
  const t = useTranslations('card');

  const { user } = useAuth();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data, isLoading } = useCard(slug);
  // Related cards key off the resolved doc id (the URL carries a slug now), so
  // they fetch once the card itself has loaded.
  const { data: relatedData } = useRelated(data?.card?.id);
  // Cards that others linked to this one — author-only surface.
  const isOwner = !!user && !!data?.card && user.id === data.card.authorId;
  const { data: linkedData } = useLinkedToCard(isOwner ? data?.card?.id : undefined);

  // Fetch resonance status to determine page background color sequence
  const incoming = useResonanceCards(data?.card?.id);
  const source = useReferencedCard(data?.card?.referenceCardId);

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

  const hasResonance = (incoming.data?.cards.length ?? 0) > 0 || (source.data?.cards.length ?? 0) > 0;

  const mainContainerStyle = {
    maxWidth: 'var(--page-max-w-wide)',
    margin: '0 auto',
    padding:
      'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) clamp(40px, 6vw, 80px)',
  } as const;

  return (
    <div className={styles.pageContainer}>
      <div style={mainContainerStyle}>
        <div className={styles.layout}>
          <article className={styles.article}>
            {/* Compact author header — shown inline only on mobile (the rail is
                hidden there). */}
            <header className={styles.mobileAuthor}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <HandDrawnAvatar
                  src={author.avatarUrl}
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

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <h1 className={styles.title} style={{ flex: 1, minWidth: 0 }}>
                {card.thoughtCore}
              </h1>
              {isOwner && (
                <CardActionsMenu
                  card={{ id: card.id, visibility: card.visibility }}
                  seed={hue + 3}
                  // Re-read this card so the visibility chip/state reflects the change.
                  onChanged={() => void mutate(`card:${slug}:${user!.id}`)}
                  onDeleted={() => router.replace('/me')}
                />
              )}
            </div>

            <div ref={storyRef} style={{ marginBottom: 32 }}>
              <StoryMarkdown source={card.story} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
              {card.tags.map((tag) => (
                <TagPill
                  key={tag}
                  color={card.accentHue != null ? `oklch(92% 0.06 ${card.accentHue})` : 'var(--color-terracotta-light)'}
                >
                  {tag}
                </TagPill>
              ))}
            </div>

            <CardViewerActions
              cardId={card.id}
              cardTitle={card.thoughtCore}
              author={{
                id: author.id,
                handle: author.handle,
                initials: author.initials,
                accentColor: author.accentColor,
              }}
            />

            {isOwner && (linkedData?.cards.length ?? 0) > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h3 className={styles.linkedHeading}>{t('linkedCards')}</h3>
                <MiniCardGrid cards={linkedData!.cards} authors={linkedData!.authors} />
              </section>
            )}

          </article>

          <aside className={styles.aside}>
            <CardAuthorAside author={author} verifiedLabel={t('verified')} />
            <CardToc headings={headings} title={t('toc')} />
          </aside>
        </div>
      </div>

      {hasResonance && (
        <section className={styles.resonanceSection}>
          <SectionEdge
            topColor="var(--color-cream)"
            seed={41}
            height={90}
            amplitude={0.14}
            steps={14}
            stroke="oklch(55% 0.05 60 / 0.28)"
            strokeWidth={1.2}
          />
          <div className={styles.sectionContainer}>
            <ResonanceCards card={card} />
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className={hasResonance ? styles.relatedSectionSecondary : styles.relatedSectionPrimary}>
          <SectionEdge
            topColor={hasResonance ? "var(--color-cream-dark)" : "var(--color-cream)"}
            seed={137}
            height={90}
            amplitude={0.14}
            steps={14}
            stroke="oklch(55% 0.05 60 / 0.28)"
            strokeWidth={1.2}
          />
          <div className={styles.sectionContainer}>
            <h2 className={styles.relatedHeading}>{t('related')}</h2>
            <CardLinkGrid cards={related} authors={relatedAuthors} />
          </div>
        </section>
      )}
    </div>
  );
}
