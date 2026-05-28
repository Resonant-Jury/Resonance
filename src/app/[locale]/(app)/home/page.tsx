import { getTranslations, setRequestLocale } from 'next-intl/server';
import { repos } from '@/lib/db';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';

export default async function HomeFeedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const cards = await repos.card.findLatestPublishedFeed(12);
  const authorIds = Array.from(new Set(cards.map((c) => c.authorId)));
  const authorList = await Promise.all(authorIds.map((id) => repos.user.findById(id)));
  const authors: Record<string, User> = {};
  for (const u of authorList) if (u) authors[u.id] = u;

  const isEmpty = cards.length === 0;

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: 'clamp(32px, 5vw, 64px) clamp(20px, 4vw, 48px) 80px',
      }}
    >
      <header style={{ marginBottom: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TagPill color="oklch(92% 0.075 88)">{new Date().toLocaleDateString(locale, {
          month: 'long',
          day: 'numeric',
        })}</TagPill>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(32px, 5vw, 44px)',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}
        >
          {t('heading')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(15px, 1.8vw, 17px)',
            color: 'var(--color-text-muted)',
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          {t('subheading')}
        </p>
      </header>

      {isEmpty ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 20px',
            color: 'var(--color-text-muted)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--color-text)', marginBottom: 8 }}>
            {t('empty.title')}
          </p>
          <p style={{ marginBottom: 24 }}>{t('empty.subtitle')}</p>
          <Link href="/write" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="primary">{t('empty.cta')}</OrganicButton>
          </Link>
        </div>
      ) : (
        <>
          <CardLinkGrid cards={cards} authors={authors} />
          <footer
            style={{
              marginTop: 64,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 22,
                color: 'var(--color-text)',
              }}
            >
              {t('endOfDay')}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <OrganicButton variant="outline">{t('moreBtn')}</OrganicButton>
              <Link href="/write" style={{ textDecoration: 'none' }}>
                <OrganicButton variant="primary">{t('writeResponse')}</OrganicButton>
              </Link>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
