// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import zh from '@/messages/zh-TW.json';
import { renderWithIntl } from '../../../../test/render';
import { TermsConsent } from './TermsConsent';

describe('TermsConsent', () => {
  it('links the terms and the privacy policy inside the sentence, in English', () => {
    renderWithIntl(<TermsConsent />);
    const p = screen.getByText(/By continuing, you agree to the/);
    expect(p.textContent).toBe('By continuing, you agree to the Terms of Use and the Privacy Policy.');
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/en/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/en/privacy');
  });

  it('keeps each language’s word order', () => {
    renderWithIntl(<TermsConsent />, { locale: 'zh-TW', messages: zh });
    expect(screen.getByText(/繼續即表示你同意/).textContent).toBe('繼續即表示你同意服務條款與隱私權政策。');
    expect(screen.getByRole('link', { name: '服務條款' })).toHaveAttribute('href', '/zh-TW/terms');
  });
});
