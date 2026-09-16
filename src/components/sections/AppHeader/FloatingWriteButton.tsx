'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Icon } from '@/components/atoms/Icon';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCard } from '@/lib/data/hooks';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { INK, INK_STRONG } from '@/lib/design/strokes';

// Where the floating write button belongs: browsing surfaces only — the feed
// and card detail pages. Utility pages (settings, card box, profiles, the
// write page itself) stay free of it. Paths are locale-stripped
// (next-intl usePathname), e.g. "/home", "/card/abc".
const VISIBLE_PREFIXES = ['/home', '/card'];

function isWriteFabPath(pathname: string): boolean {
  return VISIBLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** The slug of the card page being read, if that is where we are. */
function cardSlugOf(pathname: string): string | undefined {
  const match = /^\/card\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * The primary "write a card" affordance, anchored bottom-right (it replaced
 * the old header button and now sits where the runtime tweak toggle used to
 * live). Shown only on browsing surfaces — see {@link isWriteFabPath}. Keeps
 * the organic rounded-square FAB look; uses the hand-drawn pen icon.
 *
 * On your *own* card the pen means what it looks like it means: it opens that
 * card for editing. A pen on a page you wrote that starts a blank, unrelated
 * card is the one reading of it nobody expects. Everywhere else — the feed,
 * someone else's card — it still starts a new card.
 */
export function FloatingWriteButton() {
  const t = useTranslations('app.nav');
  const pathname = usePathname();
  const isMobile = useIsMobile(720);
  const { user } = useAuth();
  // Same SWR key as the card page itself, so this rides along on that fetch
  // rather than adding one; `undefined` off a card page keeps the key null.
  const { data } = useCard(cardSlugOf(pathname));
  const card = data?.card;
  const editsOwnCard = !!user && !!card && card.authorId === user.id;
  const label = editsOwnCard ? t('editThisCard') : t('write');

  if (!isWriteFabPath(pathname)) {
    return null;
  }

  return (
    <Link
      href={editsOwnCard ? `/write/${card.id}` : '/write'}
      aria-label={label}
      style={{
        position: 'fixed',
        right: isMobile ? 20 : 24,
        bottom: isMobile ? 20 : 24,
        width: 56,
        height: 56,
        color: 'var(--color-cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
        zIndex: 90,
      }}
    >
      <HandDrawnBorder
        w={56}
        h={56}
        R={56 * 0.4}
        seed={3}
        mag={56 * 0.022}
        fillColor="var(--color-terracotta)"
        strokeColor="color-mix(in oklch, var(--color-terracotta), black 35%)"
        strokeWidth={INK}
        segmentsH={1}
        segmentsV={1}
        curve={1.3}
        cornerJitter={3.2}
        cornerOffset={56 * 0.06}
      />
      <span style={{ position: 'relative', zIndex: 1, display: 'flex' }}>
        <Icon name="pen" size={24} strokeWidth={INK_STRONG} ariaLabel={label} />
      </span>
    </Link>
  );
}
