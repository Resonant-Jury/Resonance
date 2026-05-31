'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { CardAuthorMetrics } from '@/components/molecules/CardDetail/CardAuthorMetrics';
import { CardViewerActions } from '@/components/molecules/CardDetail/CardViewerActions';
import { CardQuote } from '@/components/molecules/CardDetail/CardQuote';
import { Link } from '@/i18n/navigation';
import { useCard, useRelated } from '@/lib/data/hooks';

const wrapStyle = {
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

  if (isLoading) {
    return (
      <div style={wrapStyle}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <CardSkeleton />
        </div>
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
      <article
        style={{
          maxWidth: 760,
          margin: '0 auto',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 32,
          }}
        >
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
        </header>

        <CardQuote text={card.thoughtCore} hue={hue} />

        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 17,
            lineHeight: 1.8,
            color: 'var(--color-text)',
            whiteSpace: 'pre-wrap',
            marginBottom: 32,
          }}
        >
          {card.story}
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

      {related.length > 0 && (
        <section
          style={{
            maxWidth: 'var(--page-max-w)',
            margin: '8px auto 0',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(22px, 2.6vw, 26px)',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--color-text)',
              marginBottom: 24,
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
