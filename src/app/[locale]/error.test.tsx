// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import LocaleError from './error';

describe('the error screen of a page that threw', () => {
  it('says the page could not load and tries again on request', async () => {
    const reset = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithIntl(<LocaleError error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('alert')).toHaveTextContent(en.native.loadError);
    await userEvent.setup().click(screen.getByRole('button', { name: en.native.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });
});
