import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { repos } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
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
    <div
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: 'clamp(32px, 5vw, 56px) clamp(20px, 4vw, 48px) 80px',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(28px, 4vw, 36px)',
          fontWeight: 700,
          marginBottom: 28,
        }}
      >
        {t('editTitle')}
      </h1>
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
    </div>
  );
}
