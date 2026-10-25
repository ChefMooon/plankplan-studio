import { useRef } from 'react';
import { Dialog } from 'radix-ui';

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
  const confirmedRef = useRef(false);
  const material = deletion?.kind === 'material';
  const title = material ? `Delete ${deletion.name}?` : `Delete ${deletion?.name ?? 'part'}?`;
  const description = material
    ? `This removes ${deletion.name}, its stock options, and ${deletion.assignedPartCount} assigned part ${deletion.assignedPartCount === 1 ? 'entry' : 'entries'}.`
    : deletion?.kind === 'stock'
      ? `This removes the stock option ${deletion.name}. ${deletion.assignedPartCount} assigned part ${deletion.assignedPartCount === 1 ? 'entry will' : 'entries will'} become unassigned and remain in the cutlist.`
      : deletion?.kind === 'project'
        ? `This deletes the project ${deletion.name} and all its Design and Cutlist data from this device. This cannot be undone.`
        : `This removes ${deletion?.name ?? 'this part'} from the cutlist.`;

  return <Dialog.Root open={deletion !== null} onOpenChange={open => { if (!saving) onOpenChange(open); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="project-info-overlay" />
      <Dialog.Content className="project-info-dialog delete-confirmation-dialog" onOpenAutoFocus={event => { confirmedRef.current = false; event.preventDefault(); document.getElementById('delete-confirm-cancel')?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); if (!confirmedRef.current) window.setTimeout(restoreFocus, 0); }}>
        <Dialog.Title className="project-info-title">{title}</Dialog.Title>
        <Dialog.Description className="project-info-description">{description}</Dialog.Description>
        <div className="project-info-actions">
          <button id="delete-confirm-cancel" type="button" className="secondary" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className="primary compact delete-confirm-button" disabled={saving} onClick={() => { confirmedRef.current = true; onConfirm(); }}>{saving ? 'Deleting…' : 'Delete'}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
