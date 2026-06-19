import { setRequestLocale } from 'next-intl/server';
import { ThoughtMapPage } from '@/components/sections/ThoughtMapPage/ThoughtMapPage';

export default async function MyThoughtMapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ThoughtMapPage />;
}
