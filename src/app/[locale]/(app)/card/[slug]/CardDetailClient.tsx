'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { CardDetailSkeleton } from '@/components/molecules/CardDetail/CardDetailSkeleton';
import { LoadError } from '@/components/molecules/LoadError/LoadError';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { AuthorRegionFlag, CardAuthorAside, CardPublishedDate } from '@/components/molecules/CardDetail/CardAuthorAside';
import { publishedDate } from '@/lib/publishedDate';
import { CardToc, type TocHeading } from '@/components/molecules/CardDetail/CardToc';
import { CardActionsMenu } from '@/components/molecules/CardActionsMenu/CardActionsMenu';
import { CardSafetyMenu } from '@/components/molecules/CardDetail/CardSafetyMenu';
import { ReadAfterArea } from '@/components/molecules/CardDetail/ReadAfterArea';
import { ResonanceCards } from '@/components/molecules/CardDetail/ResonanceCards';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { ReadingProgress } from '@/components/molecules/CardDetail/ReadingProgress';
import { CardEmbedSourceContext } from '@/components/molecules/EmbedStoryCard/useCardEmbed';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import { useSWRConfig } from 'swr';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { hasSessionMark } from '@/lib/auth/firebase/client';
import { cardKey } from '@/lib/data/cardPrefill';
import type { CardSeed } from '@/lib/data/cardSeed';
import { useCard, useCardPageLists, useMyBlockedIds } from '@/lib/data/hooks';
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
 *   for an anonymous card from the server render, the answer of the browser's
 *   own read) isn't known yet. Someone else's anonymous card never names its
 *   author here, and a block never hides one (one that vanished when the
 *   reader blocked someone would tell them who wrote it): it shows once that
 *   read answers.
 * - `blocked` — the viewer blocked the author: the page reads as not found.
 */
export type StoryGate = 'show' | 'hold' | 'unknown' | 'blocked';

export function storyGate(s: {
  /** Someone is signed in in this browser (the session mark); null: can't tell yet (server, hydration). */
  signedInHere: boolean | null;
  authLoading: boolean;
  viewerId: string | undefined;
  blocked: Set<string> | undefined;
  /** The card's author; empty on someone else's anonymous card (the server never names them). */
  authorId: string;
  /** The browser's own read of the card failed: nothing more is coming. */
  failed: boolean;
  /** The browser's own read has answered (not the server render's copy any more). */
  answered?: boolean;
}): StoryGate {
  const { signedInHere, authLoading, viewerId, blocked, authorId, failed, answered = false } = s;
  if (viewerId && authorId === viewerId) return 'show';
  if (viewerId && authorId && blocked?.has(authorId)) return 'blocked';
  if (signedInHere === null) return 'unknown';
  // Nobody signed in in this browser: no block list to wait for. (A viewer
  // restored without the mark still loses the card once their list arrives.)
  if (!signedInHere) return 'show';
  if (authLoading) return 'hold';
  if (!viewerId) return 'show';
  if (!blocked) return 'hold';
  // An anonymous card: its read answered (a block never hides one), or failed.
  if (!authorId) return failed || answered ? 'show' : 'hold';
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
  const { data, isLoading, error, fromServer, mutate: readAgain } = useCard(slug, seed);
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
    answered: !!data && !fromServer,
  });
  const isOwner = !!user && !!data?.card && user.id === data.card.authorId;
  // The lists around the card (resonances, related, the author's linking
  // cards) and its story's embedded cards: signed in, one request beside the
  // card's own read, keyed by the id the server render found; signed out,
  // public reads once the card is in hand.
  const lists = useCardPageLists(data?.card?.id ?? seed?.id ?? undefined, data?.card?.referenceCardId);

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

  // The read failed (offline, the server unavailable): that says nothing
  // about the card, so not "not found" — try again (SWR retries on its own too).
  if (data === undefined && error) {
    return (
      <div style={wrapStyle}>
        <LoadError onRetry={() => void readAgain()} />
      </div>
    );
  }

  // Loaded but no visible card (missing, private, or not permitted by rules),
  // or one by someone the viewer blocked.
  if (!data || !data.card || !data.author || gate === 'blocked') {
    return (
      <div style={{ ...wrapStyle, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-text)', marginBottom: 20 }}>
          {t('notFound.title')}
        </p>
        {/* The way on is a button, and every button has a fill: the tonal pill. */}
        <OrganicButton variant="tonal" onClick={() => router.push('/home')}>
          {t('notFound.back')}
        </OrganicButton>
      </div>
    );
  }

  const { card, author } = data;
  const related = lists.related?.cards ?? [];
  const relatedAuthors = lists.related?.authors ?? {};
  const linked = isOwner ? lists.links : undefined;
  const hue = card.accentHue ?? 55;
  const published = publishedDate(card.publishedAt, locale, inBrowser ? undefined : 'UTC');

  const resonances = lists.resonances ?? { cards: [], authors: {} };
  const hasResonance = resonances.cards.length > 0;

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
      <ReadingProgress targetRef={storyRef} />
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
                    {!card.anonymous && <AuthorRegionFlag region={author.region} size={14} />}
                    {!card.anonymous && author.verified && (
                      <HandDrawnCheckmark size={13} title={t('verified')} />
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    <CardPublishedDate published={published} />
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
                priority
              />
            )}

            <div className={styles.titleRow}>
              <h1 className={styles.title}>
                {card.thoughtCore}
              </h1>
              {isOwner && (
                <CardActionsMenu
                  card={{ id: card.id, visibility: card.visibility, slug: card.slug, referenceCardId: card.referenceCardId }}
                  // The card it resonates with heads the resonance list, when the viewer may read it.
                  referenceTitle={resonances.cards.find((c) => c.id === card.referenceCardId)?.thoughtCore}
                  seed={hue + 3}
                  bare
                  // Re-read this card so the visibility chip/state reflects the change.
                  onChanged={() => void mutate(cardKey(slug, user!.id))}
                  onDeleted={() => router.replace('/me')}
                />
              )}
              {/* Someone else's anonymous card names no author: it can be reported, not its author blocked. */}
              {user && !isOwner && (card.authorId || (card.anonymous && !fromServer)) && (
                <CardSafetyMenu
                  card={{ id: card.id, authorId: card.authorId, anonymous: card.anonymous }}
                  authorHandle={author.handle}
                  seed={hue + 3}
                  bare
                />
              )}
            </div>

            <div ref={storyRef} style={{ marginBottom: 32 }}>
              {/* Signed in, the embedded cards came with the lists; the link previews come with the card. */}
              <CardEmbedSourceContext.Provider value={lists.embeds}>
                <StoryLinkPreviewsContext.Provider value={card.linkPreviews ?? null}>
                  <StoryMarkdown source={card.story} />
                </StoryLinkPreviewsContext.Provider>
              </CardEmbedSourceContext.Provider>
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
              referenceCardId={card.referenceCardId}
              author={{
                id: author.id,
                handle: author.handle,
                initials: author.initials,
                accentColor: author.accentColor,
              }}
              coreInsight={card.signature?.coreInsight}
            />

            {linked && linked.cards.length > 0 && (
              <section style={{ marginBottom: 40 }}>
                <h3 className={styles.linkedHeading}>{t('linkedCards')}</h3>
                <MiniCardGrid cards={linked.cards} authors={linked.authors} />
              </section>
            )}

          </article>

          <aside className={styles.aside}>
            <CardAuthorAside
              author={author}
              verifiedLabel={t('verified')}
              anonymous={card.anonymous}
              isOwner={isOwner}
              published={published}
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
            <ResonanceCards cards={resonances.cards} authors={resonances.authors} />
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
