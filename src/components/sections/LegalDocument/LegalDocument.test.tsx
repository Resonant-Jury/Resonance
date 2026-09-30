// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalDocument } from './LegalDocument';

const doc = {
  title: '支援',
  description: 'd',
  updated: '2026-09-30',
  body: '寫信到 **assist.resonance@gmail.com**，或看[隱私權政策](/zh-TW/privacy)與 [外部](https://example.com)。',
};

describe('LegalDocument', () => {
  it('renders the Markdown with hand-drawn links in place of plain underlines', () => {
    render(<LegalDocument doc={doc} updatedLabel="最後更新：2026年9月30日" />);
    expect(screen.getByRole('heading', { level: 1, name: '支援' })).toBeInTheDocument();
    expect(screen.getByText('最後更新：2026年9月30日')).toBeInTheDocument();

    const page = screen.getByRole('link', { name: '隱私權政策' });
    expect(page).toHaveAttribute('href', '/zh-TW/privacy');
    expect(page.querySelector('svg path')?.getAttribute('d')).toMatch(/^M/);

    const mail = screen.getByRole('link', { name: 'assist.resonance@gmail.com' });
    expect(mail).toHaveAttribute('href', 'mailto:assist.resonance@gmail.com');
    expect(mail.querySelector('svg')).not.toBeNull();

    const external = screen.getByRole('link', { name: '外部' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
