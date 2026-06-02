// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, fireEvent, waitFor, userEvent } from '@/../test/render';
import { CardEditor } from './CardEditor';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/db/firestore/client/cards', () => ({
  createCardDraft: vi.fn(),
  updateCardDraft: vi.fn(),
  publishCard: vi.fn(),
  deleteCardDraft: vi.fn(),
}));

import { createCardDraft, publishCard } from '@/lib/db/firestore/client/cards';

beforeEach(() => {
  vi.mocked(createCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(publishCard).mockResolvedValue({ id: 'pub-1' } as never);
});
afterEach(() => vi.clearAllMocks());

describe('CardEditor', () => {
  it('renders the core and story inputs', () => {
    renderWithIntl(<CardEditor locale="en" />);
    expect(screen.getByLabelText('One line: the thought at the core')).toBeInTheDocument();
    expect(screen.getByLabelText('Story')).toBeInTheDocument();
  });

  it('moves the story hint from "needs more" to "right weight" as length crosses 300', () => {
    renderWithIntl(<CardEditor locale="en" />);
    const story = screen.getByLabelText('Story');

    fireEvent.change(story, { target: { value: 'short start' } });
    expect(screen.getByText(/\/300/)).toBeInTheDocument();

    fireEvent.change(story, { target: { value: 'x'.repeat(350) } });
    expect(screen.getByText('The right weight ✿')).toBeInTheDocument();
  });

  it('adds suggested tags when the AI tag button is clicked', async () => {
    renderWithIntl(<CardEditor locale="en" />);
    await userEvent.click(screen.getByRole('button', { name: 'AI: suggest 3–5' }));
    // First sample tag should now be rendered as a pill.
    expect(screen.getByText('脆弱性')).toBeInTheDocument();
  });

  it('applies an AI title suggestion into the core field', async () => {
    renderWithIntl(<CardEditor locale="en" />);
    await userEvent.click(screen.getByRole('button', { name: /Title ideas/ }));

    const firstTitle = '有些話,寫下來,是為了自己先聽見。';
    await userEvent.click(screen.getByRole('button', { name: firstTitle }));

    expect(screen.getByLabelText('One line: the thought at the core')).toHaveValue(firstTitle);
  });

  it('saves a draft then publishes and navigates to the new card', async () => {
    renderWithIntl(<CardEditor locale="en" />);

    await userEvent.type(
      screen.getByLabelText('One line: the thought at the core'),
      'A quiet thought'
    );
    fireEvent.change(screen.getByLabelText('Story'), {
      target: { value: 'Once there was a long enough story to publish.' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(createCardDraft).toHaveBeenCalled());
    expect(createCardDraft).toHaveBeenCalledWith(
      expect.objectContaining({ thoughtCore: 'A quiet thought', originalLocale: 'en' })
    );
    expect(publishCard).toHaveBeenCalledWith('draft-1');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/card/pub-1'));
  });
});
