import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LegalDocument } from '@/components/sections/LegalDocument/LegalDocument';
import { legalDoc, legalUpdated } from '@/content/legal';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const doc = legalDoc('terms', locale);
  return { title: `${doc.title} · Resonance`, description: doc.description };
}

export default async function TermsPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDocument doc={legalDoc('terms', locale)} updated={legalUpdated(locale)} />;
}
