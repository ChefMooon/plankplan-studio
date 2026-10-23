import { Popover } from 'radix-ui';
import { useId, useState, type KeyboardEvent } from 'react';

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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex(option => option.value === value)));
  const listboxId = useId();
  const activeOption = options[activeIndex];
  const selectedOption = options.find(option => option.value === value);

  const chooseOption = (option: SelectOption) => {
    onValueChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (options.length === 0) return;

    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (activeIndex + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
      setActiveIndex(nextIndex);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (activeOption) chooseOption(activeOption);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={nextOpen => {
      if (nextOpen) setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
      setOpen(nextOpen);
    }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && activeOption ? `${listboxId}-${activeIndex}` : undefined}
          disabled={disabled}
          className={`pp-select-trigger${className ? ` ${className}` : ''}`}
          onKeyDown={handleKeyDown}
        >
          <span>{selectedOption?.label ?? value}</span>
          <span aria-hidden="true" className="pp-select-chevron">
          <svg viewBox="0 0 16 16" fill="none" focusable="false">
            <path d="m4 6 4 4 4-4" />
          </svg>
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="pp-select-content"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={event => event.preventDefault()}
        >
          <div id={listboxId} className="pp-select-viewport" role="listbox" aria-label={ariaLabel}>
            {options.map((option, index) => (
              <div
                id={`${listboxId}-${index}`}
                className="pp-select-item"
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                data-active={index === activeIndex || undefined}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {option.value === value && <span aria-hidden="true" className="pp-select-indicator">✓</span>}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
