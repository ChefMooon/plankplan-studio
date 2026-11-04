import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { CutlistManager } from './CutlistManager';

const lists = [{ id: 'main', name: 'Main' }, { id: 'doors', name: 'Doors' }];
const renderManager = (overrides: Partial<ComponentProps<typeof CutlistManager>> = {}) => {
  const props = { lists, activeId: 'main', onActiveChange: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), linkedPartCount: () => 0, ...overrides };
  return { ...render(<CutlistManager {...props} />), props };
};

describe('CutlistManager', () => {
  it('creates and renames a list with labeled controls', async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    expect(screen.getByRole('button', { name: 'Manage' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'New cutlist' }));
    await user.type(screen.getByRole('textbox', { name: 'List name' }), 'Drawer fronts');
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create list' }));
    expect(props.onCreate).toHaveBeenCalledWith('Drawer fronts');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const rename = screen.getByRole('textbox', { name: 'New list name' });
    await user.clear(rename); await user.type(rename, 'Base cabinets');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(props.onRename).toHaveBeenCalledWith('main', 'Base cabinets');
  });

  it('preserves a new-list draft when collapsed and restores focus after cancel', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'New cutlist' }));
    const input = screen.getByRole('textbox', { name: 'List name' });
    expect(input).toHaveFocus();
    await user.type(input, 'Custom cabinets');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    expect(screen.getByRole('textbox', { name: 'List name' })).toHaveValue('Custom cabinets');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'New cutlist' })).toHaveFocus();
  });

  it('discards a rename draft when its target changes or is removed', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderManager();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.clear(screen.getByRole('textbox', { name: 'New list name' }));
    await user.type(screen.getByRole('textbox', { name: 'New list name' }), 'Wrong target');
    rerender(<CutlistManager {...props} lists={[lists[1]]} activeId="doors" />);
    expect(screen.queryByRole('textbox', { name: 'New list name' })).not.toBeInTheDocument();
    expect(props.onRename).not.toHaveBeenCalled();
    rerender(<CutlistManager {...props} activeId="main" />);
    expect(screen.queryByRole('textbox', { name: 'New list name' })).not.toBeInTheDocument();
  });

  it('cancels naming on Escape and restores focus after the form is removed', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'New list name' });
    await user.type(input, 'Temporary name');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'New list name' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus();
  });

  it('offers an explicit linked copy and keeps deletion open when overlap review is required', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn<ComponentProps<typeof CutlistManager>['onDelete']>(() => ({ kind: 'done' }));
    const { props } = renderManager({ linkedPartCount: id => id === 'main' ? 2 : 0, onDelete });
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    const duplicateDialog = screen.getByRole('dialog');
    expect(within(duplicateDialog).getByText(/Planning both lists together will require review/)).toBeInTheDocument();
    await user.click(within(duplicateDialog).getByRole('radio', { name: 'Linked copy' }));
    await user.click(within(duplicateDialog).getByRole('button', { name: 'Duplicate list' }));
    expect(props.onDuplicate).toHaveBeenCalledWith('main', 'linked');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Delete its parts too' }));
    expect(within(dialog).getByText(/2 Design links will be marked for removal\. The destination cutlist will retain the Design review/)).toBeInTheDocument();
    onDelete.mockReturnValueOnce({ kind: 'error', message: 'Resolve overlapping Design links first.' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete cutlist' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Resolve overlapping Design links first.');
    onDelete.mockReturnValueOnce({ kind: 'done' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete cutlist' }));
    expect(onDelete).toHaveBeenCalledWith('main', 'doors', true, undefined, undefined, undefined);
    expect(screen.getByRole('combobox', { name: 'Cutlist' })).toHaveFocus();
  });

  it('reviews exact overlaps and applies the selected row while keeping the dialog open until resolved', async () => {
    const user = userEvent.setup();
    const conflict = { id: '["rail-new","rail-old"]', incomingPartId: 'rail-new', incomingName: 'Incoming rail', incomingQuantity: 1, incomingSourceIds: ['shared'], existingPartId: 'rail-old', existingName: 'Existing rail', existingQuantity: 1, existingSourceIds: ['shared'], kind: 'exact' as const, canSplit: true, overlappingInstanceIds: ['shared'], incomingOnlyInstanceIds: [], existingOnlyInstanceIds: [], sourceSignature: 'source-v1' };
    const onDelete = vi.fn<ComponentProps<typeof CutlistManager>['onDelete']>((_id, _destinationId, _deleteParts, resolutions) => resolutions ? { kind: 'done' } : { kind: 'review', conflicts: [conflict] });
    renderManager({ onDelete });
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete cutlist' }));
    expect(within(dialog).getByText('Choose how to resolve linked rows')).toBeInTheDocument();
    const apply = within(dialog).getByRole('button', { name: 'Apply reviewed move' });
    expect(apply).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: 'Use incoming: Incoming rail' }));
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onDelete).toHaveBeenLastCalledWith('main', 'doors', false, { [conflict.id]: 'incoming' }, [conflict], {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains per-component splits for partial overlap review', async () => {
    const user = userEvent.setup();
    const conflict = { id: '["rail-new","rail-old"]', incomingPartId: 'rail-new', incomingName: 'Incoming rail', incomingQuantity: 2, incomingSourceIds: ['shared', 'incoming-only'], existingPartId: 'rail-old', existingName: 'Existing rail', existingQuantity: 5, existingSourceIds: ['shared', 'existing-only'], kind: 'partial' as const, canSplit: true, overlappingInstanceIds: ['shared'], incomingOnlyInstanceIds: ['incoming-only'], existingOnlyInstanceIds: ['existing-only'], sourceSignature: 'partial-v1' };
    const onDelete = vi.fn<ComponentProps<typeof CutlistManager>['onDelete']>((_id, _destination, _deleteParts, resolutions) => resolutions ? { kind: 'done' } : { kind: 'review', conflicts: [conflict] });
    renderManager({ onDelete });
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete cutlist' }));
    expect(within(dialog).getByText('Partial Design overlap · rows split by component')).toBeInTheDocument();
    expect(within(dialog).getByText(/Unshared Design components keep their current row values/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Use existing values for shared components: Existing rail' }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Existing rail shared components quantity' }), '2');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Existing rail unshared components quantity' }), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Apply reviewed move' }));
    expect(onDelete).toHaveBeenLastCalledWith('main', 'doors', false, { [conflict.id]: 'existing' }, [conflict], { [JSON.stringify(['rail-old', 'shared'])]: 2, [JSON.stringify(['rail-old', 'unshared'])]: 3 });
  });

  it('explains when a manual quantity cannot cover every resulting row', async () => {
    const user = userEvent.setup();
    const conflict = { id: '["rail-new","rail-old"]', incomingPartId: 'rail-new', incomingName: 'Incoming rail', incomingQuantity: 1, incomingSourceIds: ['shared', 'incoming-only'], existingPartId: 'rail-old', existingName: 'Existing rail', existingQuantity: 2, existingSourceIds: ['shared', 'existing-only'], kind: 'partial' as const, canSplit: true, overlappingInstanceIds: ['shared'], incomingOnlyInstanceIds: ['incoming-only'], existingOnlyInstanceIds: ['existing-only'], sourceSignature: 'impossible-allocation-v1' };
    const onDelete = vi.fn<ComponentProps<typeof CutlistManager>['onDelete']>((_id, _destination, _deleteParts, resolutions) => resolutions ? { kind: 'done' } : { kind: 'review', conflicts: [conflict] });
    renderManager({ onDelete });
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete cutlist' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Use incoming values for shared components: Incoming rail' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/too few items to give every resulting row a positive quantity/);
    expect(within(dialog).getByRole('button', { name: 'Apply reviewed move' })).toBeDisabled();
  });

  it('keeps the destination row and removes incoming-only sources when deleting parts', async () => {
    const user = userEvent.setup();
    const conflict = { id: '["rail-new","rail-old"]', incomingPartId: 'rail-new', incomingName: 'Incoming rail', incomingQuantity: 2, incomingSourceIds: ['shared', 'incoming-only'], existingPartId: 'rail-old', existingName: 'Existing rail', existingQuantity: 2, existingSourceIds: ['shared', 'existing-only'], kind: 'partial' as const, canSplit: true, overlappingInstanceIds: ['shared'], incomingOnlyInstanceIds: ['incoming-only'], existingOnlyInstanceIds: ['existing-only'], sourceSignature: 'delete-partial-v1' };
    const onDelete = vi.fn<ComponentProps<typeof CutlistManager>['onDelete']>((_id, _destination, _deleteParts, resolutions) => resolutions ? { kind: 'done' } : { kind: 'review', conflicts: [conflict] });
    renderManager({ onDelete });
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Delete its parts too' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete cutlist' }));
    expect(within(dialog).getByText(/incoming-only components removed/)).toBeInTheDocument();
    expect(within(dialog).getByText(/unshared Design components are removed from the destination scope/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Delete incoming and keep existing: Existing rail' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply reviewed deletion' }));
    expect(onDelete).toHaveBeenLastCalledWith('main', 'doors', true, { [conflict.id]: 'existing' }, [conflict], {});
  });

  it('switches the active list and prevents deleting the final list', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderManager();
    await user.click(screen.getByRole('combobox', { name: 'Cutlist' }));
    await user.click(screen.getByRole('option', { name: 'Doors' }));
    expect(props.onActiveChange).toHaveBeenCalledWith('doors');
    rerender(<CutlistManager {...props} lists={[lists[0]]} activeId="main" />);
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
