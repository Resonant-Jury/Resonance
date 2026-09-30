import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LegalDocument } from '@/components/sections/LegalDocument/LegalDocument';
import { legalDoc, legalUpdated } from '@/content/legal';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const doc = legalDoc('privacy', locale);
  return { title: `${doc.title} · Resonance`, description: doc.description };
}

export default async function PrivacyPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDocument doc={legalDoc('privacy', locale)} updated={legalUpdated(locale)} />;
}
