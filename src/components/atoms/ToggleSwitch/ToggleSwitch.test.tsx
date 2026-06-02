// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { ToggleSwitch } from './ToggleSwitch';

// Smoke test that doubles as proof the component-testing harness works:
// jsdom environment + Testing Library + user-event + the JSX transform.
// It exercises the switch the way a user would, via role + aria semantics.
describe('ToggleSwitch', () => {
  it('exposes switch semantics reflecting the checked prop', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} ariaLabel="Auto translate" />);
    const sw = screen.getByRole('switch', { name: 'Auto translate' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects the checked state through aria-checked', () => {
    render(<ToggleSwitch checked onChange={() => {}} ariaLabel="Auto translate" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when the user clicks it', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="Auto translate" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
