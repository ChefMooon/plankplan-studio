import { Select as RadixSelect } from 'radix-ui';

export type SelectOption = { value: string; label: string };

type SelectProps = {
  'aria-label': string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
};

export function Select({ 'aria-label': ariaLabel, value, onValueChange, options, disabled, className }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger aria-label={ariaLabel} className={`pp-select-trigger${className ? ` ${className}` : ''}`}>
        <RadixSelect.Value />
        <RadixSelect.Icon aria-hidden="true" className="pp-select-chevron">
          <svg viewBox="0 0 16 16" fill="none" focusable="false">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="pp-select-content" position="popper" sideOffset={4} collisionPadding={8}>
          <RadixSelect.Viewport className="pp-select-viewport">
            {options.map(option => (
              <RadixSelect.Item className="pp-select-item" key={option.value} value={option.value}>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator aria-hidden="true" className="pp-select-indicator">✓</RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
