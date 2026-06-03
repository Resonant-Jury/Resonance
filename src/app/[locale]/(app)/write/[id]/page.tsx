import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { repos } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { PageShell, PageTitle } from '@/components/molecules/PageShell/PageShell';
import type { Locale } from '@/lib/db/types';

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('write');
  const user = await requireUser();
  const card = await repos.card.findById(id, user.id);
  if (!card || card.authorId !== user.id) notFound();
  return (
    <PageShell width="narrow">
      <PageTitle>{t('editTitle')}</PageTitle>
      <CardEditor
        initial={{
          id: card.id,
          thoughtCore: card.thoughtCore,
          story: card.story,
          tags: card.tags,
          visibility: card.visibility,
          media: card.media,
        }}
        locale={locale as Locale}
      />
    </PageShell>
  );
}
