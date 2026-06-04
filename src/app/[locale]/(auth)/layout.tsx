import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { Link } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        background: 'var(--color-cream)',
      }}
    >
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          marginBottom: 'clamp(36px, 6vw, 56px)',
        }}
      >
        <ResonanceIcon size={44} />
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--color-text)',
          }}
        >
          Resonance
        </span>
      </Link>
      {children}
    </main>
  );
}
