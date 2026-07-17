'use client';

import { Suspense } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
import type { Locale } from '@/lib/db/types';

// Reading the query client-side keeps this route fully static — awaiting
// `searchParams` on the server forced a per-request render just to pass one
// optional id through. useSearchParams needs a Suspense boundary to keep the
// static shell prerenderable.
function WritePageInner() {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const search = useSearchParams();
  const referenceCardId = search.get('referenceCardId') ?? undefined;
  return (
    <WriteWorkspace
      title={t('title')}
      locale={locale}
      referenceCardId={referenceCardId}
      backCardKey={referenceCardId}
    />
  );
}

export default function WritePage() {
  return (
    <Suspense>
      <WritePageInner />
    </Suspense>
  );
}
