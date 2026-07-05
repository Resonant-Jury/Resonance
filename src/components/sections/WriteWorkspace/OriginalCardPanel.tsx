'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useCard } from '@/lib/data/hooks';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { Link } from '@/i18n/navigation';
import styles from './OriginalCardPanel.module.css';

interface OriginalCardPanelProps {
  cardId: string;
}

export function OriginalCardPanel({ cardId }: OriginalCardPanelProps) {
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  const locale = useLocale();
  const { data, isLoading } = useCard(cardId);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingPulse} />
      </div>
    );
  }

  if (!data || !data.card || !data.author) {
    return null;
  }

  const { card, author } = data;
  const hue = card.accentHue ?? 55;

  return (
    <div className={styles.panel}>
      <header className={styles.authorHeader}>
        {card.anonymous ? (
          <HandDrawnAvatar initials="·" size={40} color="var(--color-cream-dark)" seed={97} />
        ) : (
          <HandDrawnAvatar
            src={author.avatarUrl}
            initials={author.initials}
            size={40}
            color={author.accentColor}
            seed={Number(author.avatarSeed)}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {card.anonymous ? (
              <span className={styles.authorNameAnonymous}>
                {tCard('anonymousAuthor')}
              </span>
            ) : (
              <Link href={`/u/${author.handle}`} className={styles.authorNameLink}>
                {author.handle}
              </Link>
            )}
            {!card.anonymous && author.verified && (
              <HandDrawnCheckmark size={13} title={tCard('verified')} />
            )}
          </div>
          <div className={styles.authorMeta}>
            {card.anonymous ? '' : author.region}
            {card.publishedAt
              ? `${card.anonymous ? '' : ' · '}${new Date(card.publishedAt).toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
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

      <h2 className={styles.title}>{card.thoughtCore}</h2>

      <div className={styles.story}>
        <StoryMarkdown source={card.story} />
      </div>

      <div className={styles.tagRow}>
        {card.tags.map((tag) => (
          <TagPill
            key={tag}
            color={card.accentHue != null ? `oklch(92% 0.06 ${card.accentHue})` : 'var(--color-terracotta-light)'}
          >
            {tag}
          </TagPill>
        ))}
      </div>
    </div>
  );
}
