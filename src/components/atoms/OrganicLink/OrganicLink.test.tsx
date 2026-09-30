// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganicLink } from './OrganicLink';

/** A link's underline: the path's data and the viewBox it is drawn in. */
function underlineOf(link: HTMLElement) {
  const svg = link.querySelector('svg');
  const d = svg?.querySelector('path')?.getAttribute('d') ?? '';
  const [, , width, height] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
  return { svg, d, width, height, crests: (d.match(/C/g) ?? []).length };
}

const underline = (name: string | RegExp) => underlineOf(screen.getByRole('link', { name }));

describe('OrganicLink', () => {
  it('links a site path client-side and an outside address in a new tab', () => {
    render(
      <>
        <OrganicLink href="/en/privacy">Privacy</OrganicLink>
        <OrganicLink href="https://example.com/x">Elsewhere</OrganicLink>
        <OrganicLink href="mailto:a@b.co">Write to us</OrganicLink>
      </>
    );
    const page = screen.getByRole('link', { name: 'Privacy' });
    expect(page).toHaveAttribute('href', '/en/privacy');
    expect(page).not.toHaveAttribute('target');

    const outside = screen.getByRole('link', { name: 'Elsewhere' });
    expect(outside).toHaveAttribute('href', 'https://example.com/x');
    expect(outside).toHaveAttribute('target', '_blank');
    expect(outside).toHaveAttribute('rel', 'noopener noreferrer');

    const mail = screen.getByRole('link', { name: 'Write to us' });
    expect(mail).toHaveAttribute('href', 'mailto:a@b.co');
    expect(mail).not.toHaveAttribute('target');
  });

  it('draws the pen stroke under the text without adding to its accessible name', () => {
    render(<OrganicLink href="/en/terms">Terms of Use</OrganicLink>);
    const { svg, d } = underline('Terms of Use');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    expect(d).toMatch(/^M 0,0 C /);
    expect(svg?.querySelector('path')).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  });

  it('gives a longer link more crests, so the wave keeps its rhythm instead of stretching', () => {
    render(
      <>
        <OrganicLink href="/a">Help</OrganicLink>
        <OrganicLink href="/b">assist.resonance.writing.in.the.open@gmail.com</OrganicLink>
      </>
    );
    const short = underline('Help');
    const long = underline(/assist\.resonance/);
    expect(long.width).toBeGreaterThan(short.width * 5);
    expect(long.crests).toBeGreaterThan(short.crests * 5);
    // A crest every ~4.5px at the estimated width, not a lazy handful.
    expect(short.width / short.crests).toBeGreaterThan(3.5);
    expect(short.width / short.crests).toBeLessThan(5.5);
    expect(long.width / long.crests).toBeGreaterThan(3.5);
    expect(long.width / long.crests).toBeLessThan(5.5);
  });

  it('counts Han text as wider than the same number of Latin letters', () => {
    render(
      <>
        <OrganicLink href="/zh-TW/privacy">隱私權政策</OrganicLink>
        <OrganicLink href="/en/privacy">privacy</OrganicLink>
      </>
    );
    const han = underline('隱私權政策');
    const latin = underline('privacy');
    expect(han.width).toBe(80); // five characters, an em each, at 16px
    expect(latin.width).toBe(56); // seven letters at ~0.5em
    expect(han.crests).toBeGreaterThan(latin.crests);
  });

  it('sizes the stroke by the text however the children nest it', () => {
    render(
      <>
        <OrganicLink href="/a">
          <strong>Bold</strong> text
        </OrganicLink>
        <OrganicLink href="/a">Bold text</OrganicLink>
      </>
    );
    const [nested, flat] = screen.getAllByRole('link', { name: 'Bold text' }).map(underlineOf);
    expect(nested.width).toBe(flat.width);
    expect(nested.d).toBe(flat.d);
  });

  it('draws the same stroke for the same href on every render, a different one for another', () => {
    const { unmount } = render(<OrganicLink href="/en/privacy">Privacy Policy</OrganicLink>);
    const first = underline('Privacy Policy');
    unmount();

    render(<OrganicLink href="/en/privacy">Privacy Policy</OrganicLink>);
    expect(underline('Privacy Policy').d).toBe(first.d);
    expect(first.d).toMatch(/\d/);
    // The path closes the line where the viewBox ends.
    expect(first.d.trim().split(' ').pop()).toBe(`${first.width},0`);
  });

  it('wobbles each link its own way, and lets a seed take over', () => {
    render(
      <>
        <OrganicLink href="/en/privacy">Policy</OrganicLink>
        <OrganicLink href="/en/terms">Policy</OrganicLink>
        <OrganicLink href="/en/privacy" seed={7}>
          Policy
        </OrganicLink>
      </>
    );
    const [a, b, c] = screen.getAllByRole('link').map((el) => el.querySelector('path')?.getAttribute('d'));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('falls back to a fixed width when the children spell no text', () => {
    render(
      <OrganicLink href="/en/logo">
        <span role="img" aria-label="Logo" />
      </OrganicLink>
    );
    const { width, height, crests } = underline('Logo');
    expect(width).toBe(120);
    expect(height).toBe(6);
    expect(crests).toBe(27);
  });
});
