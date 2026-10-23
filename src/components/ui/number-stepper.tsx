import { useRef, type ChangeEvent, type InputHTMLAttributes, type PointerEvent } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string | number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStep: (steps: number) => void;
};

export function NumberStepper({ value, onChange, onStep, ...inputProps }: Props) {
  const drag = useRef<{ id: number; y: number; steps: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, y: event.clientY, steps: 0 };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const steps = Math.trunc((current.y - event.clientY) / 8);
    const delta = steps - current.steps;
    if (delta) { onStep(delta); current.steps = steps; }
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };
  const label = inputProps['aria-label'] ?? 'Value';
  return <div className="number-stepper"><input {...inputProps} value={value} onChange={onChange} onKeyDown={event => {
    inputProps.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onStep(event.key === 'ArrowUp' ? 1 : -1); }
  }}/><span className="number-stepper-controls"><span className="number-stepper-arrows"><button type="button" aria-label={`Increase ${label}`} onPointerDown={event => event.preventDefault()} onClick={() => onStep(1)}>▲</button><button type="button" aria-label={`Decrease ${label}`} onPointerDown={event => event.preventDefault()} onClick={() => onStep(-1)}>▼</button></span><button type="button" className="number-stepper-grip" aria-label={`Drag to adjust ${label}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>⠿</button></span></div>;
}
