import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { repos } from '@/lib/db';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { CardAuthorMetrics } from '@/components/molecules/CardDetail/CardAuthorMetrics';
import { CardViewerActions } from '@/components/molecules/CardDetail/CardViewerActions';
import { CardQuote } from '@/components/molecules/CardDetail/CardQuote';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';

// ISR — render once per card and serve the static HTML for up to a day.
// Author edits / publish events ping /api/revalidate to regenerate.
// Only public + published cards are baked into the cache; private and
// connections-only cards are read client-direct from Firestore (rules enforce
// visibility), so the static page renders the public shape and the viewer
// actions hydrate per-viewer state.
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('card');

  // Render only public, published cards in the static page. Viewer-specific
  // visibility (private / connections-only) is intentionally not baked into
  // ISR — those readers can still see the card via client-direct Firestore
  // reads from a profile or feed view.
  const card = await repos.card.findById(id, null);
  if (!card) notFound();
  if (!card.publishedAt || card.visibility !== 'public') notFound();

  const [author, related] = await Promise.all([
    repos.user.findById(card.authorId),
    repos.card.findRelated(card.id, 3),
  ]);
  if (!author) notFound();
  const relatedAuthorIds = Array.from(new Set(related.map((c) => c.authorId)));
  const relatedAuthorList = await Promise.all(relatedAuthorIds.map((rid) => repos.user.findById(rid)));
  const relatedAuthors: Record<string, User> = {};
  for (const u of relatedAuthorList) if (u) relatedAuthors[u.id] = u;

  const hue = card.accentHue ?? 55;

  return (
    <div
      style={{
        padding:
          'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
      }}
    >
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
