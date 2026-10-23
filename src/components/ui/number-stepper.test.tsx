import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumberStepper } from './number-stepper';

function Harness({ initial = 2, min = 0 }: { initial?: number; min?: number }) {
  const [value, setValue] = useState(initial);
  return <NumberStepper aria-label="Quantity" type="number" min={min} value={value} onChange={event => setValue(Number(event.target.value))} onStep={steps => setValue(current => Math.max(min, current + steps))} />;
}

describe('NumberStepper', () => {
  it('steps with buttons and arrow keys and respects bounded values without modifier acceleration', () => {
    render(<Harness initial={1} min={1} />);
    const input = screen.getByRole('spinbutton', { name: 'Quantity' });
    fireEvent.click(screen.getByRole('button', { name: 'Increase Quantity' }));
    expect(input).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Quantity' }));
    expect(input).toHaveValue(1);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue(2);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue(1);
    fireEvent.keyDown(input, { key: 'ArrowDown', ctrlKey: true });
    expect(input).toHaveValue(1);
  });

  it('applies drag direction and absolute 8px thresholds; tap and cancellation do not add steps', () => {
    render(<Harness />);
    const grip = screen.getByRole('button', { name: 'Drag to adjust Quantity' });
    fireEvent.pointerDown(grip, { pointerId: 3, button: 0, clientY: 100 });
    fireEvent.pointerMove(grip, { pointerId: 3, clientY: 82 });
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(4);
    fireEvent.pointerMove(grip, { pointerId: 3, clientY: 90 });
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(3);
    fireEvent.pointerCancel(grip, { pointerId: 3 });
    fireEvent.pointerDown(grip, { pointerId: 4, button: 0, clientY: 50 });
    fireEvent.pointerUp(grip, { pointerId: 4, clientY: 50 });
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(3);
  });

  it('keeps decimal values typed by the caller', () => {
    function Decimal() {
      const [value, setValue] = useState('1.25');
      return <NumberStepper aria-label="Tax rate" value={value} onChange={event => setValue(event.target.value)} onStep={steps => setValue(String(Math.max(0, Number(value) + steps * 0.01)))} />;
    }
    render(<Decimal />);
    const input = screen.getByRole('textbox', { name: 'Tax rate' });
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(input).toHaveValue('1.5');
  });
});
