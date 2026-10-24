import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MaterialTypeToggle } from './MaterialTypeToggle';

describe('MaterialTypeToggle', () => {
  it('provides named icon-only choices and reports a type change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeToggle value="linear" onChange={onChange}/>);
    expect(screen.getByRole('radiogroup', { name: 'Material type' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Linear material' })).toBeChecked();
    expect(screen.getByText('Linear material')).toHaveClass('sr-only');
    await user.click(screen.getByRole('radio', { name: 'Sheet material' }));
    expect(onChange).toHaveBeenCalledWith('sheet');
  });

  it('keeps the locked selection readable and explains the lock on keyboard focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeToggle value="sheet" onChange={onChange} disabled/>);
    const group = screen.getByRole('radiogroup', { name: 'Material type' });
    expect(group).toHaveAccessibleDescription('Material type is fixed after stock is added.');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Sheet material' })).toBeChecked();
    await user.tab();
    expect(screen.getByRole('note', { name: 'Material type locked' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Material type is fixed after stock is added.');
    await user.click(screen.getByRole('radio', { name: 'Linear material' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
