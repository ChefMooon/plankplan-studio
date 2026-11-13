import { Tooltip as RadixTooltip } from 'radix-ui';
import { useState, type ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Suppresses the tooltip without changing the trigger's place in the tree. */
  disabled?: boolean;
}

export function Tooltip({ children, content, side = 'right', disabled = false }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <RadixTooltip.Root open={open && !disabled} onOpenChange={setOpen}>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="pp-tooltip" side={side} sideOffset={7} collisionPadding={8}>
            {content}
            <RadixTooltip.Arrow className="pp-tooltip-arrow" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
