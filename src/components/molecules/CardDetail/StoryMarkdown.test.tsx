// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen } from '@/../test/render';
import fixture from '../../../../native/fixtures/story-link-cards.json';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import type { LinkPreview } from '@/lib/db/types';
import { BLANK_PARAGRAPH } from '@/lib/markdown/blankLines';
import { StoryMarkdown } from './StoryMarkdown';

// A card embed reads its card; here it only has to be told apart from a link card.
vi.mock('@/components/molecules/EmbedStoryCard/CardEmbedLink', () => ({
  CardEmbedLink: ({ href }: { href: string }) => <span data-testid="card-embed">{href}</span>,
}));

describe('StoryMarkdown', () => {
  it('gives a photo its own block, so it never runs into the sentence above', () => {
    renderWithIntl(
      <StoryMarkdown source={'On the last day it rained.\n\n![postbox](https://cdn/x.webp)\n\nI ran.'} />
    );
    const img = screen.getByAltText('postbox');
    // Out of the paragraph flow entirely: the block owns the spacing, so the
    // writer never has to type blank lines around a picture.
    expect(img.closest('p')).toBeNull();
    expect(img.closest('[class*="imageBlock"]')).not.toBeNull();
  });

  it('renders a line the writer deliberately left blank as space', () => {
    const { container } = renderWithIntl(
      <StoryMarkdown source={`above\n\n${BLANK_PARAGRAPH}\n\nbelow`} />
    );
    expect(container.querySelector('[class*="blankLine"]')).not.toBeNull();
    // The marker itself is never read out or copied as text.
    expect(screen.queryByText(BLANK_PARAGRAPH)).toBeNull();
  });

  it('leaves ordinary prose as paragraphs', () => {
    const { container } = renderWithIntl(<StoryMarkdown source={'one\n\ntwo'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('underlines a link with the pen wave, per link, and no straight rule', () => {
    renderWithIntl(<StoryMarkdown source={'see [here](https://example.com/a) and [there](https://example.com/b)'} />);
    const a = screen.getByRole('link', { name: 'here' });
    const b = screen.getByRole('link', { name: 'there' });
    expect(a.className).toMatch(/link/);
    expect(a.getAttribute('href')).toBe('https://example.com/a');
    const wa = a.style.getPropertyValue('--wave');
    expect(wa).toContain('data:image/svg+xml');
    expect(a.style.getPropertyValue('--wave-strong')).toContain('stroke-opacity');
    expect(a.style.getPropertyValue('--wave-size')).toBe('36px 6px');
    expect(b.style.getPropertyValue('--wave')).not.toBe(wa);
  });

  // As a link card does: another site's page opens in a tab of its own, sending no referrer and vouching for
  // nothing; our own pages, a heading's anchor and a mail address stay where they are.
  it('opens a link to another site in a new tab, and keeps links to our pages in this one', () => {
    renderWithIntl(
      <StoryMarkdown
        source={
          'I walked [slowly](https://example.com/walk) to [her page](https://resonance.channel/zh-TW/u/ana), ' +
          '[the top](#top), [a card](/card/rain-walk) and [mail](mailto:a@example.com), past https://www.example.org/x.'
        }
      />,
    );
    for (const name of ['slowly', 'https://www.example.org/x']) {
      const away = screen.getByRole('link', { name });
      expect(away).toHaveAttribute('target', '_blank');
      expect(away.getAttribute('rel')!.split(' ').sort()).toEqual(['nofollow', 'noopener', 'noreferrer', 'ugc']);
    }
    for (const name of ['her page', 'the top', 'a card', 'mail']) {
      const here = screen.getByRole('link', { name });
      expect(here).not.toHaveAttribute('target');
      expect(here).not.toHaveAttribute('rel');
    }
  });
});

const previewOf = (url: string, extra: Partial<LinkPreview> = {}): LinkPreview => ({ url, title: `Title of ${url}`, ...extra });

function renderStory(source: string, previews: LinkPreview[] | null) {
  return renderWithIntl(
    <StoryLinkPreviewsContext.Provider value={previews}>
      <StoryMarkdown source={source} />
    </StoryLinkPreviewsContext.Provider>,
  );
}

/** The addresses of the link cards drawn, in order, each once. */
const cardLinks = () => [
  ...new Set(screen.queryAllByRole('link', { name: /^Open link:/ }).map((a) => a.getAttribute('href'))),
];

describe('StoryMarkdown link cards', () => {
  interface Case {
    id: string;
    markdown: string;
    links: string[];
    inline?: string[];
    webDrawsNone?: boolean;
  }

  // The rule shared with the server and the apps: given a preview for every
  // link the server stores and for every link that must stay inline, the
  // reader draws exactly the stored ones as cards.
  it.each((fixture.cases as Case[]).map((c) => [c.id, c] as const))('%s (native/fixtures/story-link-cards.json)', (_id, c) => {
    renderStory(c.markdown, [...c.links, ...(c.inline ?? [])].map((url) => previewOf(url)));
    expect(cardLinks()).toEqual(c.webDrawsNone ? [] : c.links);
  });

  it("draws the page's card in place of the link: picture, title, description and host, opening in a new tab", () => {
    const { container } = renderStory('Before.\n\n<https://www.example.com/rain>\n\nAfter.', [
      previewOf('https://www.example.com/rain', {
        title: 'A rainy walk',
        description: 'Notes from a walk after the rain.',
        siteName: 'Example',
        image: '/api/link-image?u=https%3A%2F%2Fcdn.example.com%2Fc.jpg&s=sig',
      }),
    ]);
    const card = screen.getByRole('link', { name: 'Open link: example.com' });
    expect(card).toHaveAttribute('href', 'https://www.example.com/rain');
    expect(card).toHaveAttribute('target', '_blank');
    expect(card.getAttribute('rel')!.split(' ').sort()).toEqual(['nofollow', 'noopener', 'noreferrer', 'ugc']);
    // Read out with its title, not only the host.
    expect(document.getElementById(card.getAttribute('aria-describedby')!)).toHaveTextContent('A rainy walk');
    expect(card).toHaveTextContent('Notes from a walk after the rain.');
    expect(card).toHaveTextContent('example.com');
    expect(card.querySelector('img')).toHaveAttribute('src', '/api/link-image?u=https%3A%2F%2Fcdn.example.com%2Fc.jpg&s=sig');
    // The card is its own block, never inside a paragraph; the prose around it stays prose.
    expect(card.closest('p')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('drops the picture, frame and all, when it fails to load', () => {
    renderStory('https://example.com/a', [previewOf('https://example.com/a', { image: '/api/link-image?u=x&s=y' })]);
    const card = screen.getByRole('link', { name: 'Open link: example.com' });
    fireEvent.error(card.querySelector('img')!);
    expect(card.querySelector('img')).toBeNull();
    expect(card).toHaveTextContent('Title of https://example.com/a');
  });

  it('draws the link as it always was when it has no preview', () => {
    renderStory('https://example.com/a\n\n[named](https://example.com/b)', [previewOf('https://example.com/other')]);
    expect(cardLinks()).toEqual([]);
    expect(screen.getByRole('link', { name: 'named' })).toHaveAttribute('href', 'https://example.com/b');
    expect(screen.getByRole('link', { name: 'https://example.com/a' }).closest('p')).not.toBeNull();
    // Without any previews at all, too (another page's StoryMarkdown).
    renderWithIntl(<StoryMarkdown source="https://example.com/c" />);
    expect(screen.getByRole('link', { name: 'https://example.com/c' })).toBeInTheDocument();
  });

  it('keeps a card link an embedded card, whatever previews the page has', () => {
    renderStory('[A card](/card/a-quiet-night)', [previewOf('https://example.com/a')]);
    expect(screen.getByTestId('card-embed')).toHaveTextContent('/card/a-quiet-night');
    expect(cardLinks()).toEqual([]);
  });

  it('takes the key of a bare www address as the server does (GFM would link it to http://)', () => {
    renderStory('www.example.org/notes', [previewOf('https://www.example.org/notes')]);
    expect(cardLinks()).toEqual(['https://www.example.org/notes']);
  });
});
