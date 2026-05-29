import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { PageShell, PageTitle } from '@/components/molecules/PageShell/PageShell';
import type { Locale } from '@/lib/db/types';

export default async function WritePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('write');
  return (
    <PageShell>
      <PageTitle>{t('title')}</PageTitle>
      <CardEditor locale={locale as Locale} />
    </PageShell>
  );
}
