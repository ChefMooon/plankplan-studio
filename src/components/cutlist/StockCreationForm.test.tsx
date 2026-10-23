import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StockCreationForm } from './StockCreationForm';

describe('StockCreationForm', () => {
  it('keeps invalid custom dimensions draft-only, then creates a fractional-inch stock', async () => {
    const onCreate = vi.fn();
    render(<StockCreationForm mode="stock" fixedKind="linear" unitSystem="imperial" onCancel={vi.fn()} onCreate={onCreate}/>);
    fireEvent.click(screen.getByRole('combobox', { name: 'Stock source' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Custom dimensions' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom stock length' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom board width' }), { target: { value: '3 1/2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom stock thickness' }), { target: { value: '1 1/2' } });
    fireEvent.click(screen.getByRole('button', { name: /Add stock/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('positive, valid dimension');
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Custom stock length' }), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: /Add stock/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ length: { um: 1_828_800 }, widthUm: 88_900, thicknessUm: 38_100, ownedQuantity: 0 });
  });

  it('lets a new material use a common sheet preset without adding a price', async () => {
    const onCreate = vi.fn();
    render(<StockCreationForm mode="material" unitSystem="metric" defaultMaterialName="Plywood" onCancel={vi.fn()} onCreate={onCreate}/>);
    expect(screen.getByRole('group', { name: 'New material type' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Linear material' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Sheet material' }));
    expect(screen.getByRole('button', { name: 'Sheet material' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Create material/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ name: '1220 × 2440 mm', length: { um: 2_440_000 }, widthUm: 1_220_000, ownedQuantity: 0 });
    expect(onCreate.mock.calls[0][1]).toBe('sheet');
    expect(onCreate.mock.calls[0][2]).toBe('Plywood');
  });
});
