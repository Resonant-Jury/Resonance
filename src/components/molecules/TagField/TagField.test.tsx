// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen, fireEvent, userEvent } from '@/../test/render';
import { TagField } from './TagField';

/** The field with its list held by a parent, as the editor holds it. */
function Harness({
  initial = [],
  onSuggest = () => undefined,
  suggesting = false,
  error = null,
}: {
  initial?: string[];
  onSuggest?: () => void;
  suggesting?: boolean;
  error?: string | null;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagField tags={tags} onChange={setTags} onSuggest={onSuggest} suggesting={suggesting} error={error} />
      <output data-testid="tags">{JSON.stringify(tags)}</output>
    </>
  );
}

const list = () => JSON.parse(screen.getByTestId('tags').textContent ?? '[]') as string[];
const input = () => screen.getByLabelText('Type a tag…');

describe('TagField', () => {
  it('asks the model when nothing is typed and adds the typed tag otherwise', async () => {
    const onSuggest = vi.fn();
    renderWithIntl(<Harness onSuggest={onSuggest} />);

    await userEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
    expect(onSuggest).toHaveBeenCalledTimes(1);

    fireEvent.change(input(), { target: { value: 'travel' } });
    const add = screen.getByRole('button', { name: 'Add' });
    expect(screen.queryByRole('button', { name: 'Suggest with AI' })).not.toBeInTheDocument();
    await userEvent.click(add);

    expect(list()).toEqual(['travel']);
    expect(onSuggest).toHaveBeenCalledTimes(1);
    // The caret stays in the field, ready for the next one.
    expect(input()).toHaveFocus();
  });

  it('adds on Enter, trimmed, and ignores an empty or repeated tag', () => {
    renderWithIntl(<Harness initial={['travel']} />);

    fireEvent.change(input(), { target: { value: '  home ' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(list()).toEqual(['travel', 'home']);

    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.change(input(), { target: { value: 'travel' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(list()).toEqual(['travel', 'home']);
    expect(input()).toHaveValue('');
  });

  it.each([
    ['a comma', 'travel,'],
    ['a full-width comma', 'travel，'],
    ['an enumeration comma', 'travel、'],
  ])('ends a tag at %s and keeps what follows for the next one', (_name, typed) => {
    renderWithIntl(<Harness />);

    fireEvent.change(input(), { target: { value: typed } });
    expect(list()).toEqual(['travel']);
    expect(input()).toHaveValue('');

    fireEvent.change(input(), { target: { value: 'home,fa' } });
    expect(list()).toEqual(['travel', 'home']);
    expect(input()).toHaveValue('fa');
  });

  it('splits a pasted list in one go, drops the repeats, and leaves the last word to finish', () => {
    renderWithIntl(<Harness initial={['home']} />);

    fireEvent.change(input(), { target: { value: 'home, travel，family、 ,memory' } });

    expect(list()).toEqual(['home', 'travel', 'family']);
    expect(input()).toHaveValue('memory');
  });

  it('leaves Enter and the commas to an input method that is mid-word', () => {
    renderWithIntl(<Harness />);

    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ㄌㄩˇ' } });
    // The Enter that confirms a word is the IME's, in Chrome and in Safari.
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    expect(list()).toEqual([]);
    expect(input()).toHaveValue('ㄌㄩˇ');

    // A comma committed with the word still ends the tag once it is done.
    fireEvent.change(input(), { target: { value: '旅行，' } });
    expect(list()).toEqual([]);
    fireEvent.compositionEnd(input());
    expect(list()).toEqual(['旅行']);
    expect(input()).toHaveValue('');
  });

  it('takes the last tag back on Backspace in an empty input, one per press', () => {
    renderWithIntl(<Harness initial={['a', 'b', 'c']} />);

    // Text in the input: Backspace is just Backspace.
    fireEvent.change(input(), { target: { value: 'x' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(list()).toEqual(['a', 'b', 'c']);

    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(list()).toEqual(['a', 'b']);

    // Holding the key does not eat the rest.
    fireEvent.keyDown(input(), { key: 'Backspace', repeat: true });
    expect(list()).toEqual(['a', 'b']);
  });

  it('removes a tag with its ×', async () => {
    renderWithIntl(<Harness initial={['a', 'b']} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove tag' })[0]);

    expect(list()).toEqual(['b']);
  });

  it('says how to add under the field, and the error instead once there is one', () => {
    const { rerender } = renderWithIntl(<Harness />);
    expect(screen.getByText('Press Enter to add one, or let AI suggest from your story')).toBeInTheDocument();

    rerender(<Harness error="Couldn’t suggest tags — please try again" />);
    expect(screen.getByText('Couldn’t suggest tags — please try again')).toBeInTheDocument();
    expect(screen.queryByText(/Press Enter/)).not.toBeInTheDocument();
  });

  it('shows the model is thinking in the action, which stays the AI one', () => {
    renderWithIntl(<Harness suggesting />);

    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeInTheDocument();
  });
});
