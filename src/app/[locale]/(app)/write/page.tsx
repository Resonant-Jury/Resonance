import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageShell } from '@/components/molecules/PageShell/PageShell';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
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
    <PageShell width="wide" style={{ maxWidth: 'min(1560px, 100%)' }}>
      <WriteWorkspace title={t('title')} locale={locale as Locale} />
    </PageShell>
  );
}
