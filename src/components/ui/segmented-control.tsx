import { RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  'aria-label': string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  disabled?: boolean;
  className?: string;
};

/** A controlled, single-choice group with equal-width segments. */
export function SegmentedControl<T extends string>({ 'aria-label': ariaLabel, value, onValueChange, options, disabled, className }: SegmentedControlProps<T>) {
  return <RadioGroup.Root
    aria-label={ariaLabel}
    className={`segmented-control${className ? ` ${className}` : ''}`}
    orientation="horizontal"
    value={value}
    disabled={disabled}
    onValueChange={nextValue => {
      const option = options.find(item => item.value === nextValue);
      if (option) onValueChange(option.value);
    }}
  >
    {options.map(option => <RadioGroup.Item key={option.value} value={option.value} disabled={option.disabled} className="segmented-control-option">
      {option.icon && <span className="segmented-control-icon" aria-hidden="true">{option.icon}</span>}
      <span>{option.label}</span>
    </RadioGroup.Item>)}
  </RadioGroup.Root>;
}
