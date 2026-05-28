import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CURRENT_USER_ID, repos } from '@/lib/db';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ResonateButton } from '@/components/molecules/ResonateButton/ResonateButton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import { ConnectInviteLauncher } from '@/components/molecules/ConnectInviteModal/ConnectInviteLauncher';

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('card');

  const card = await repos.card.findById(id, CURRENT_USER_ID);
  if (!card) notFound();

  const [author, resonated, related] = await Promise.all([
    repos.user.findById(card.authorId),
    repos.resonance.hasResonated(card.id, CURRENT_USER_ID),
    repos.card.findRelated(card.id, 3),
  ]);
  if (!author) notFound();
  const isSelf = card.authorId === CURRENT_USER_ID;
  const relatedAuthorIds = Array.from(new Set(related.map((c) => c.authorId)));
  const relatedAuthorList = await Promise.all(relatedAuthorIds.map((id) => repos.user.findById(id)));
  const relatedAuthors: Record<string, User> = {};
  for (const u of relatedAuthorList) if (u) relatedAuthors[u.id] = u;

  const hue = card.accentHue ?? 55;

  return (
    <article
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: 'clamp(32px, 5vw, 64px) clamp(20px, 4vw, 48px) 80px',
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
        {card.visibility !== 'public' && (
          <TagPill color="oklch(92% 0.033 215)">
            {card.visibility === 'private' ? t('private') : t('connections')}
          </TagPill>
        )}
      </header>

      <figure
        style={{
          position: 'relative',
          padding: '40px 28px',
          borderRadius: '28px 32px 26px 30px',
          background: `oklch(95% 0.04 ${hue} / 0.55)`,
          marginBottom: 32,
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: -4,
            left: 18,
            fontFamily: 'var(--font-heading)',
            fontSize: 72,
            color: `oklch(60% 0.12 ${hue} / 0.35)`,
            lineHeight: 1,
          }}
        >
          “
        </span>
        <blockquote
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(24px, 3.4vw, 34px)',
            fontWeight: 700,
            lineHeight: 1.35,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          {card.thoughtCore}
        </blockquote>
      </figure>

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

      {!isSelf && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            padding: '24px 0',
            borderTop: '1px solid oklch(80% 0.02 75)',
            borderBottom: '1px solid oklch(80% 0.02 75)',
            marginBottom: 40,
          }}
        >
          <ResonateButton cardId={card.id} initialResonated={resonated} />
          <Link href={`/write?ref=${card.id}`} style={{ textDecoration: 'none' }}>
            <OrganicButton variant="outline">{t('writeResponse')}</OrganicButton>
          </Link>
          <ConnectInviteLauncher
            targetUser={{ id: author.id, handle: author.handle, initials: author.initials, accentColor: author.accentColor }}
            referenceCardId={card.id}
          />
        </div>
      )}

      {isSelf && (
        <aside
          style={{
            padding: 24,
            borderRadius: 20,
            background: 'oklch(94% 0.03 75 / 0.4)',
            marginBottom: 40,
          }}
        >
          <h4
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 14,
            }}
          >
            {t('authorMetrics.title')}
          </h4>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <MetricBox label={t('authorMetrics.reads')} value={card.readCount} />
            <MetricBox label={t('authorMetrics.resonances')} value={card.resonanceCount} />
            <MetricBox label={t('authorMetrics.inviteRequests')} value={card.inviteCount} />
          </div>
        </aside>
      )}

      {related.length > 0 && (
        <section>
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              marginBottom: 20,
            }}
          >
            {t('related')}
          </h3>
          <CardLinkGrid cards={related} authors={relatedAuthors} />
        </section>
      )}
    </article>
  );
}

function MetricBox({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--color-text)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}
