import { RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: string;
  ariaLabel?: string;
  keyShortcuts?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  'aria-label': string;
  'aria-describedby'?: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  disabled?: boolean;
  className?: string;
  iconOnly?: boolean;
};

/** A controlled, single-choice group with equal-width segments. */
export function SegmentedControl<T extends string>({ 'aria-label': ariaLabel, 'aria-describedby': describedBy, value, onValueChange, options, disabled, className, iconOnly = false }: SegmentedControlProps<T>) {
  return <RadioGroup.Root
    aria-label={ariaLabel}
    aria-describedby={describedBy}
    className={`segmented-control${iconOnly ? ' segmented-control-icon-only' : ''}${className ? ` ${className}` : ''}`}
    orientation="horizontal"
    value={value}
    disabled={disabled}
    onValueChange={nextValue => {
      const option = options.find(item => item.value === nextValue);
      if (option) onValueChange(option.value);
    }}
  >
    {options.map(option => {
      const item = <RadioGroup.Item key={option.value} value={option.value} aria-label={option.ariaLabel} aria-keyshortcuts={option.keyShortcuts} disabled={option.disabled} className="segmented-control-option">
        {option.icon && <span className="segmented-control-icon" aria-hidden="true">{option.icon}</span>}
        <span className={iconOnly && option.icon ? 'sr-only' : undefined}>{option.label}</span>
      </RadioGroup.Item>;
      return iconOnly ? <Tooltip key={option.value} content={option.label} side="top">{item}</Tooltip> : item;
    })}
  </RadioGroup.Root>;
}
