// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/../test/render';
import { MiniStoryCard } from './MiniStoryCard';

describe('MiniStoryCard', () => {
  it('renders only the title and author — no excerpt or tags', () => {
    render(
      <MiniStoryCard
        title="A quiet realization"
        author="@friend"
        authorInitials="FR"
        imageLabel="cover"
        index={0}
      />,
    );
    expect(screen.getByRole('heading', { name: 'A quiet realization' })).toBeInTheDocument();
    expect(screen.getByText('@friend')).toBeInTheDocument();
    // The simplified card deliberately drops the excerpt/tags/read-time chrome.
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it('renders the cover image when an imageUrl is provided', () => {
    render(
      <MiniStoryCard
        title="With a photo"
        author="@friend"
        authorInitials="FR"
        imageUrl="https://example.com/x.jpg"
        index={1}
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/x.jpg');
  });
});
