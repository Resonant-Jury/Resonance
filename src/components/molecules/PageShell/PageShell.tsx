import type { CSSProperties, ReactNode } from 'react';

export interface PageShellProps {
  children: ReactNode;
  /** "default" = 1080px, "wide" = 1200px */
  width?: 'default' | 'wide';
  /** Optional override; otherwise uses --page-pad-top from tokens. */
  topPad?: CSSProperties['paddingTop'];
  className?: string;
  style?: CSSProperties;
}

/**
 * Standard page container for (app) routes.
 *
 * Responsibilities:
 * - Centers content at the right max-width.
 * - Owns the vertical rhythm BELOW the fixed AppHeader. The (app) layout no
 *   longer applies its own top padding to <main>; PageShell uses
 *   calc(var(--app-header-h) + var(--page-pad-top)) so the title always sits
 *   safely below the header (including its translucent wave area).
 * - Provides bottom breathing room before the (mobile) floating CTA.
 */
export function PageShell({
  children,
  width = 'default',
  topPad,
  className,
  style,
}: PageShellProps) {
  const maxWidth = width === 'wide' ? 'var(--page-max-w-wide)' : 'var(--page-max-w)';
  return (
    <div
      className={className}
      style={{
        maxWidth,
        margin: '0 auto',
        paddingTop: topPad ?? 'calc(var(--app-header-h) + var(--page-pad-top))',
        paddingBottom: 'var(--page-pad-bottom)',
        paddingLeft: 'var(--page-pad-x)',
        paddingRight: 'var(--page-pad-x)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface PageTitleProps {
  children: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  align?: 'start' | 'center';
}

export function PageTitle({ children, eyebrow, subtitle, align = 'start' }: PageTitleProps) {
  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 'clamp(28px, 4vw, 44px)',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        textAlign: align === 'center' ? 'center' : 'left',
      }}
    >
      {eyebrow}
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(28px, 4vw, 40px)',
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          margin: 0,
        }}
      >
        {children}
      </h1>
      {subtitle && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(15px, 1.8vw, 17px)',
            color: 'var(--color-text-muted)',
            maxWidth: 560,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}
