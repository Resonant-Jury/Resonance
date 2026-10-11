// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import en from '@/messages/en.json';
import zh from '@/messages/zh-TW.json';
import { CTASection, titleClauses } from './CTASection';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>
      {children}
    </a>
  ),
}));

describe('the closing band', () => {
  // Its title breaks at the comma when it needs two lines, never inside a
  // clause: each clause is one unbreakable piece, the comma with the first.
  it('splits its title into clauses at the comma', () => {
    expect(titleClauses(zh.cta.title)).toEqual(['分享你的故事，', '讓世界聽見你的聲音']);
    expect(titleClauses('Share your story, and be heard')).toEqual(['Share your story,', 'and be heard']);
    expect(titleClauses(en.cta.title)).toEqual([en.cta.title]);

    renderWithIntl(<CTASection />, { locale: 'zh-TW', messages: zh });
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(zh.cta.title);
    expect(Array.from(heading.children, (c) => c.textContent)).toEqual(['分享你的故事，', '讓世界聽見你的聲音']);
  });

  // Two different jobs: writing (signed out, the writer asks to sign in first
  // and comes back) and reading the feed, open to anyone.
  it('offers writing a story and reading the stories already there', () => {
    renderWithIntl(<CTASection />);
    expect(screen.getByRole('link', { name: en.cta.write })).toHaveAttribute('href', '/write');
    expect(screen.getByRole('link', { name: en.cta.read })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: /sign ?up/i })).toBeNull();
  });
});
