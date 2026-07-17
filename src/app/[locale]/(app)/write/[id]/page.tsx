'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardById } from '@/lib/db/firestore/client/reads';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/lib/db/types';

// The draft loads client-direct from Firestore (rules already scope reads to
// the owner) instead of blocking navigation on a server function — opening a
// card for editing paints immediately with a loader, like the card page.
export default function EditCardPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  const locale = useLocale() as Locale;
  const { user, loading } = useAuth();

  // Wait for auth to settle: fetching during restoration would read as an
  // anonymous viewer and "not found" the owner's own draft.
  const key = id && user && !loading ? `editcard:${id}:${user.id}` : null;
  const { data: card } = useSWR(key, () => getCardById(id!));

  const settled = card !== undefined || (!loading && !user);
  if (!settled) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'calc(var(--app-header-h) + 120px) 20px 120px',
        }}
        aria-busy="true"
      >
        <SketchLoader />
      </div>
    );
  }

  // Missing, deleted, or not the viewer's card (rules deny → null).
  if (!card || !user || card.authorId !== user.id) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
        }}
      >
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
          {tCard('notFound.title')}
        </p>
        <Link href="/home" style={{ textDecoration: 'none' }}>
          <span style={{ color: 'var(--color-terracotta)' }}>{tCard('notFound.back')}</span>
        </Link>
      </div>
    );
  }

  return (
    <WriteWorkspace
      title={t('editTitle')}
      locale={locale}
      referenceCardId={card.referenceCardId}
      backCardKey={
        card.publishedAt ? (card.slug ?? card.id) : card.referenceCardId
      }
      initial={{
        id: card.id,
        thoughtCore: card.thoughtCore,
        story: card.story,
        tags: card.tags,
        visibility: card.visibility,
        media: card.media,
        anonymous: card.anonymous,
      }}
    />
  );
}
