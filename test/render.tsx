// Shared render helper for component tests.
//
// Most Resonance components call `useTranslations()` from next-intl, so they
// must be rendered inside a NextIntlClientProvider or they throw. This wraps
// Testing Library's `render` with that provider, loading the real `en`
// messages by default so tests assert against actual copy.
//
// Usage (remember the jsdom directive at the top of the test file):
//   // @vitest-environment jsdom
//   import { renderWithIntl, screen } from '@/../test/render';
//   renderWithIntl(<SiteFooter />);
//   expect(screen.getByRole('contentinfo')).toBeInTheDocument();
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import enMessages from '@/messages/en.json';

interface IntlRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: string;
  messages?: AbstractIntlMessages;
}

export function renderWithIntl(
  ui: ReactElement,
  { locale = 'en', messages = enMessages, ...options }: IntlRenderOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

// Re-export the Testing Library surface so test files have a single import.
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
