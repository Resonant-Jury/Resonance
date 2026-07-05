import { getTranslations, setRequestLocale } from 'next-intl/server';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
import type { Locale } from '@/lib/db/types';

export default async function WritePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ referenceCardId?: string }>;
}) {
  const { locale } = await params;
  const { referenceCardId } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('write');
  return (
    <WriteWorkspace
      title={t('title')}
      locale={locale as Locale}
      referenceCardId={referenceCardId}
    />
  );
}
