// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import { FirstCardGuide } from './FirstCardGuide';

describe('FirstCardGuide', () => {
  it('offers the guiding questions and hands the chosen one to the parent', async () => {
    const onPick = vi.fn();
    renderWithIntl(<FirstCardGuide onPick={onPick} />);

    expect(screen.getByText('Write your first card')).toBeInTheDocument();

    // All three questions render as pickable actions.
    const q1 = 'What small moment recently changed how you see something?';
    const q2 = 'What is one thing you wish you could tell your past self?';
    const q3 = 'Which failure taught you something nobody else ever did?';
    for (const q of [q1, q2, q3]) {
      expect(screen.getByRole('button', { name: new RegExp(q.slice(0, 30)) })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: new RegExp(q2.slice(0, 30)) }));
    expect(onPick).toHaveBeenCalledWith(q2);
  });
});
