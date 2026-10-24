import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const options = [
  { value: 'preset', label: 'Preset', icon: <svg data-testid="option-icon"/> },
  { value: 'custom', label: 'Custom', disabled: true },
  { value: 'saved', label: 'Saved' },
] as const;

function Example() {
  const [value, setValue] = useState<string>('preset');
  return <><SegmentedControl aria-label="Source" value={value} onValueChange={setValue} options={options}/><button>After</button></>;
}

describe('SegmentedControl', () => {
  it('labels the group, exposes selection, and hides decorative icons', () => {
    render(<Example/>);
    expect(screen.getByRole('radiogroup', { name: 'Source' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Preset' })).toBeChecked();
    expect(screen.getByTestId('option-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses one tab stop and arrow keys wrap while skipping disabled options', async () => {
    const user = userEvent.setup();
    render(<Example/>);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Preset' })).toHaveFocus();
    await user.keyboard('{ArrowRight>}');
    expect(screen.getByRole('radio', { name: 'Saved' })).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Saved' })).toBeChecked());
    await user.keyboard('{/ArrowRight}');
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Preset' })).toBeChecked());
    await user.keyboard('{/ArrowRight}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('supports pointer selection and disables the entire group', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<SegmentedControl aria-label="Source" value="preset" onValueChange={onValueChange} options={options}/>);
    await user.click(screen.getByRole('radio', { name: 'Saved' }));
    expect(onValueChange).toHaveBeenCalledWith('saved');
    rerender(<SegmentedControl aria-label="Source" value="preset" onValueChange={onValueChange} options={options} disabled/>);
    onValueChange.mockClear();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Saved' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
