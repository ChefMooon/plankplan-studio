import { useRef } from 'react';
import { Dialog } from 'radix-ui';

export function ConfirmationDialog({ open, title, description, confirmLabel, pendingLabel = 'Working…', onOpenChange, onConfirm, restoreFocus, saving = false }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  restoreFocus: () => void;
  saving?: boolean;
}) {
  const confirmedRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <Dialog.Root open={open} onOpenChange={open => { if (!saving) onOpenChange(open); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="project-info-overlay" />
      <Dialog.Content className="project-info-dialog delete-confirmation-dialog" onOpenAutoFocus={event => { confirmedRef.current = false; event.preventDefault(); cancelRef.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); if (!confirmedRef.current) window.setTimeout(restoreFocus, 0); }}>
        <Dialog.Title className="project-info-title">{title}</Dialog.Title>
        <Dialog.Description className="project-info-description">{description}</Dialog.Description>
        <div className="project-info-actions">
          <button ref={cancelRef} type="button" className="secondary" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className="primary compact delete-confirm-button" disabled={saving} onClick={() => { confirmedRef.current = true; onConfirm(); }}>{saving ? pendingLabel : confirmLabel}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
