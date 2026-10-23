import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';

export function Tooltip({ children, content, side = 'right' }: { children: ReactNode; content: string; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <RadixTooltip.Root>
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
