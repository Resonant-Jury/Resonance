'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCardById } from '@/lib/db/firestore/client/reads';
import { getPendingCardEdit, type PendingCardEdit } from '@/lib/db/firestore/client/cardEdits';
import { Link } from '@/i18n/navigation';
import type { Card, Locale } from '@/lib/db/types';

interface Opened {
  key: string;
  card: Card | null;
  pending: PendingCardEdit | null;
}

// The draft loads client-direct from Firestore (rules already scope reads to
// the owner) instead of blocking navigation on a server function — opening a
// card for editing paints immediately with a loader, like the card page.
//
// Read fresh on every open, never from a cache: the editor copies what it is
// given once, and autosaves over the card from there — handed the copy from
// an earlier visit, it would save that older text over what was written
// since.
export default function EditCardPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const t = useTranslations('write');
  const tCard = useTranslations('card');
  const locale = useLocale() as Locale;
  const { user, loading } = useAuth();

  // Wait for auth to settle: fetching during restoration would read as an
  // anonymous viewer and "not found" the owner's own draft.
  const key = id && user && !loading ? `${id}:${user.id}` : null;
  const [opened, setOpened] = useState<Opened | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void (async () => {
      const found = await getCardById(id!).catch(() => null);
      const pending = found?.publishedAt ? await getPendingCardEdit(found.id) : null;
      if (live) setOpened({ key, card: found, pending });
    })();
    return () => {
      live = false;
    };
  }, [key, id]);
  // Only what was read for this card and this viewer, on this visit.
  const data = opened && opened.key === key ? opened : undefined;
  const card = data?.card;
  const pending = data?.pending ?? null;

  const settled = data !== undefined || (!loading && !user);
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

  // Buffered edits win over the live fields — that is the copy being worked on.
  const values = pending ?? card;
  return (
    <WriteWorkspace
      title={card.publishedAt ? t('editPublishedTitle') : t('editTitle')}
      locale={locale}
      referenceCardId={card.referenceCardId}
      initial={{
        id: card.id,
        slug: card.slug,
        publishedAt: card.publishedAt,
        hasPendingEdit: pending != null,
        thoughtCore: values.thoughtCore,
        story: values.story,
        tags: values.tags,
        visibility: values.visibility,
        media: values.media,
        accentHue: values.accentHue ?? undefined,
        anonymous: values.anonymous,
      }}
    />
  );
}
