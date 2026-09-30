'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardDetailSkeleton } from '@/components/molecules/CardDetail/CardDetailSkeleton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { CardAuthorAside } from '@/components/molecules/CardDetail/CardAuthorAside';
import { CardToc, type TocHeading } from '@/components/molecules/CardDetail/CardToc';
import { CardActionsMenu } from '@/components/molecules/CardActionsMenu/CardActionsMenu';
import { CardSafetyMenu } from '@/components/molecules/CardDetail/CardSafetyMenu';
import { ReadAfterArea } from '@/components/molecules/CardDetail/ReadAfterArea';
import { ResonanceCards } from '@/components/molecules/CardDetail/ResonanceCards';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { useSWRConfig } from 'swr';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { hasSessionMark } from '@/lib/auth/firebase/client';
import { cardKey } from '@/lib/data/cardPrefill';
import type { CardSeed } from '@/lib/data/cardSeed';
import {
  useCard,
  useLinkedToCard,
  useMyBlockedIds,
  useRelated,
  useResonanceCards,
  useReferencedCard,
} from '@/lib/data/hooks';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { CARD_HOLD_ATTR } from './cardHold';
import styles from './page.module.css';

const wrapStyle = {
  maxWidth: 'var(--page-max-w-wide)',
  margin: '0 auto',
  padding:
    'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
} as const;

/**
 * Whether the card may show yet, for a reader who may have blocked its author.
 * Blocks are the viewer's own, so the cached, viewer-independent server HTML
 * can't apply them; the browser does, and a signed-in reader never sees a
 * blocked author's card, not even for a moment:
 *
 * - `unknown` — the server render and hydration, which can't know the reader.
 *   The markup carries `data-card-hold`, which the page's pre-hydration script
 *   hides in a browser someone is signed in in (cardHold.ts); a signed-out
 *   reader sees the server's HTML at once.
 * - `hold` — someone is signed in in this browser, and their block list (or,
 *   for an anonymous card from the server, which author it is) isn't known yet.
 * - `blocked` — the viewer blocked the author: the page reads as not found.
 */
export type StoryGate = 'show' | 'hold' | 'unknown' | 'blocked';

export function storyGate(s: {
  /** Someone is signed in in this browser (the session mark); null: can't tell yet (server, hydration). */
  signedInHere: boolean | null;
  authLoading: boolean;
  viewerId: string | undefined;
  blocked: Set<string> | undefined;
  /** The card's author; empty while an anonymous card is still the server's (which never names them). */
  authorId: string;
  /** The browser's own read of the card failed: nothing more is coming. */
  failed: boolean;
}): StoryGate {
  const { signedInHere, authLoading, viewerId, blocked, authorId, failed } = s;
  if (viewerId && authorId === viewerId) return 'show';
  if (viewerId && authorId && blocked?.has(authorId)) return 'blocked';
  if (signedInHere === null) return 'unknown';
  // Nobody signed in in this browser: no block list to wait for. (A viewer
  // restored without the mark still loses the card once their list arrives.)
  if (!signedInHere) return 'show';
  if (authLoading) return 'hold';
  if (!viewerId) return 'show';
  if (!blocked) return 'hold';
  if (!authorId) return failed ? 'show' : 'hold';
  return 'show';
}

const subscribeNever = () => () => {};
const isBrowser = () => true;
const notBrowser = () => false;

export interface CardDetailClientProps {
  /** The URL segment: a slug, or a legacy doc id. */
  slug: string;
  /** What the server render found (see CardSeed); null when it couldn't tell. */
  seed: CardSeed | null;
}

export function CardDetailClient({ slug, seed }: CardDetailClientProps) {
  const locale = useLocale();
  const t = useTranslations('card');

  const { user, loading } = useAuth();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data, isLoading, error } = useCard(slug, seed);
  const { data: blocked } = useMyBlockedIds();
  // False for the server render and hydration (which must draw the same
  // markup), true from then on.
  const inBrowser = useSyncExternalStore(subscribeNever, isBrowser, notBrowser);
  const gate = storyGate({
    signedInHere: inBrowser ? hasSessionMark() : null,
    authLoading: loading,
    viewerId: user?.id,
    blocked,
    authorId: data?.card?.authorId ?? '',
    failed: !!error,
  });
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

  // Loaded but no visible card (missing, private, or not permitted by rules),
  // or one by someone the viewer blocked.
  if (!data || !data.card || !data.author || gate === 'blocked') {
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

  const held = gate === 'hold';
  return (
    <div
      className={styles.pageContainer}
      // Pending (`unknown`, `hold`): hidden in a signed-in browser until its
      // blocks are known — by the pre-hydration style first, then here.
      {...(held || gate === 'unknown' ? { [CARD_HOLD_ATTR]: '' } : {})}
      style={held ? { visibility: 'hidden' } : undefined}
      aria-busy={held || undefined}
    >
      <div style={mainContainerStyle}>
        <div className={styles.layout}>
          <article className={styles.article}>
            {/* Compact author header — shown inline only on mobile (the rail is
                hidden there). */}
            <header className={styles.mobileAuthor}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {card.anonymous ? (
                  <HandDrawnAvatar initials="·" size={44} color="var(--color-cream-dark)" seed={97} />
                ) : (
                  <HandDrawnAvatar
                    src={author.avatarUrl}
                    initials={author.initials}
                    size={44}
                    color={author.accentColor}
                    seed={Number(author.avatarSeed)}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {card.anonymous ? (
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {t('anonymousAuthor')}
                      </span>
                    ) : (
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
                    )}
                    {!card.anonymous && author.verified && (
                      <HandDrawnCheckmark size={13} title={t('verified')} />
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {card.anonymous ? '' : author.region}
                    {card.publishedAt
                      ? `${card.anonymous ? '' : ' · '}${new Date(card.publishedAt).toLocaleDateString(locale, {
                        month: 'short',
                        day: 'numeric',
                        // The server's zone isn't the reader's: the server
                        // render and hydration agree on UTC, the reader's own
                        // zone follows.
                        timeZone: inBrowser ? undefined : 'UTC',
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

            <div className={styles.titleRow}>
              <h1 className={styles.title}>
                {card.thoughtCore}
              </h1>
              {isOwner && (
                <CardActionsMenu
                  card={{ id: card.id, visibility: card.visibility, slug: card.slug }}
                  seed={hue + 3}
                  // Re-read this card so the visibility chip/state reflects the change.
                  onChanged={() => void mutate(cardKey(slug, user!.id))}
                  onDeleted={() => router.replace('/me')}
                />
              )}
              {/* An anonymous card from the server names no author yet. */}
              {user && !isOwner && card.authorId && (
                <CardSafetyMenu
                  card={{ id: card.id, authorId: card.authorId, anonymous: card.anonymous }}
                  authorHandle={author.handle}
                  seed={hue + 3}
                />
              )}
            </div>

            <div ref={storyRef} style={{ marginBottom: 32 }}>
              <StoryMarkdown source={card.story} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
              {/* Tags are app furniture, not card content — they stay in the
                  theme color even when the card carries its own accent hue. */}
              {card.tags.map((tag) => (
                <TagPill key={tag} color="var(--color-terracotta-light)">
                  {tag}
                </TagPill>
              ))}
            </div>

            <ReadAfterArea
              cardId={card.id}
              cardTitle={card.thoughtCore}
              author={{
                id: author.id,
                handle: author.handle,
                initials: author.initials,
                accentColor: author.accentColor,
              }}
              coreInsight={card.signature?.coreInsight}
            />

            {isOwner && (linkedData?.cards.length ?? 0) > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h3 className={styles.linkedHeading}>{t('linkedCards')}</h3>
                <MiniCardGrid cards={linkedData!.cards} authors={linkedData!.authors} />
              </section>
            )}

          </article>

          <aside className={styles.aside}>
            <CardAuthorAside
              author={author}
              verifiedLabel={t('verified')}
              anonymous={card.anonymous}
              isOwner={isOwner}
            />
            <CardToc headings={headings} title={t('toc')} />
          </aside>
        </div>
      </div>

      {hasResonance && (
        <section className={styles.resonanceSection}>
          <div className={styles.sectionEdgeDesktop}>
            <SectionEdge
              topColor="var(--color-cream)"
              seed={41}
              height={90}
              amplitude={0.14}
              steps={14}
              stroke="oklch(55% 0.05 60 / 0.28)"
              strokeWidth={1.2}
            />
          </div>
          <div className={styles.sectionContainer}>
            <ResonanceCards card={card} />
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className={hasResonance ? styles.relatedSectionSecondary : styles.relatedSectionPrimary}>
          <div className={styles.sectionEdgeDesktop}>
            <SectionEdge
              topColor={hasResonance ? "var(--color-cream-dark)" : "var(--color-cream)"}
              seed={137}
              height={90}
              amplitude={0.14}
              steps={14}
              stroke="oklch(55% 0.05 60 / 0.28)"
              strokeWidth={1.2}
            />
          </div>
          <div className={styles.sectionContainer}>
            <h2 className={styles.relatedHeading}>{t('related')}</h2>
            <CardLinkGrid cards={related} authors={relatedAuthors} />
          </div>
        </section>
      )}
    </div>
  );
}
