// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import { BLANK_PARAGRAPH } from '@/lib/markdown/blankLines';
import { StoryMarkdown } from './StoryMarkdown';

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
});
