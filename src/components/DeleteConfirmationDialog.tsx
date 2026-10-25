import { ConfirmationDialog } from '@/components/ConfirmationDialog';

export type DeleteConfirmation =
  | { kind: 'project'; id: string; name: string }
  | { kind: 'part'; id: string; name: string }
  | { kind: 'material'; id: string; name: string; assignedPartCount: number }
  | { kind: 'stock'; id: string; name: string; assignedPartCount: number };

export function DeleteConfirmationDialog({ deletion, onOpenChange, onConfirm, restoreFocus, saving = false }: {
  deletion: DeleteConfirmation | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  restoreFocus: () => void;
  saving?: boolean;
}) {
  const material = deletion?.kind === 'material';
  const title = material ? `Delete ${deletion.name}?` : `Delete ${deletion?.name ?? 'part'}?`;
  const description = material
    ? `This removes ${deletion.name}, its stock options, and ${deletion.assignedPartCount} assigned part ${deletion.assignedPartCount === 1 ? 'entry' : 'entries'}.`
    : deletion?.kind === 'stock'
      ? `This removes the stock option ${deletion.name}. ${deletion.assignedPartCount} assigned part ${deletion.assignedPartCount === 1 ? 'entry will' : 'entries will'} become unassigned and remain in the cutlist.`
      : deletion?.kind === 'project'
        ? `This deletes the project ${deletion.name} and all its Design and Cutlist data from this device. This cannot be undone.`
        : `This removes ${deletion?.name ?? 'this part'} from the cutlist.`;

  return <ConfirmationDialog open={deletion !== null} title={title} description={description} confirmLabel="Delete" pendingLabel="Deleting…" onOpenChange={onOpenChange} onConfirm={onConfirm} restoreFocus={restoreFocus} saving={saving} />;
}
