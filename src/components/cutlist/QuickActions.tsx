import { DropdownMenu } from 'radix-ui';

export interface QuickActionCallbacks {
  move: (direction: -1 | 1) => void;
  duplicate: () => void;
  remove: () => void;
}

interface QuickActionsProps {
  kind: 'part' | 'material' | 'stock';
  label: string;
  id: string;
  position: number;
  count: number;
  actions: QuickActionCallbacks;
}

/** Shared, accessible item menu for moving, copying, and removing editor entries. */
export function QuickActions({ kind, label, id, position, count, actions }: QuickActionsProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button id={`${kind}-actions-${id}`} type="button" className="quick-actions-trigger" aria-label={`${label} actions`} aria-haspopup="menu">⋯</button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="quick-actions-menu" align="end" sideOffset={5}>
          <DropdownMenu.Item disabled={position === 0} onSelect={() => actions.move(-1)}>Move up</DropdownMenu.Item>
          <DropdownMenu.Item disabled={position === count - 1} onSelect={() => actions.move(1)}>Move down</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={actions.duplicate}>Duplicate</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item className="destructive-action" onSelect={actions.remove}>Delete</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
