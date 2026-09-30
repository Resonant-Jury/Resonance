import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LegalDocument } from '@/components/sections/LegalDocument/LegalDocument';
import { legalUpdatedLabel, loadLegalDoc } from '@/lib/legal/legalDocs';

// Built from docs/legal/privacy.{zh-TW,en}.md; a changed file shows after the next build.
export const dynamic = 'force-static';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const doc = loadLegalDoc('privacy', locale);
  return { title: `${doc.title} · Resonance`, description: doc.description };
}

export default async function PrivacyPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const doc = loadLegalDoc('privacy', locale);
  return <LegalDocument doc={doc} updatedLabel={legalUpdatedLabel(doc.updated, locale)} />;
}
