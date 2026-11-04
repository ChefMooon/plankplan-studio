import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { Select } from '@/components/ui/select';
import type { Cutlist } from '@/lib/planner/model';
import { cutlistMoveAllocationId, type CutlistMoveAllocations, type CutlistMoveConflict, type CutlistMoveResolutions, type DuplicateCutlistMode } from '@/lib/planner/cutlists';
import './cutlist-manager.css';

export type CutlistDeleteOutcome = { kind: 'done' } | { kind: 'review'; conflicts: CutlistMoveConflict[] } | { kind: 'error'; message: string };

export function CutlistManager({ lists, activeId, onActiveChange, onCreate, onRename, onDuplicate, onDelete, linkedPartCount, designReview }: {
  lists: Cutlist[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string, mode: DuplicateCutlistMode) => void;
  onDelete: (id: string, destinationId: string, deleteParts: boolean, resolutions?: CutlistMoveResolutions, reviewedConflicts?: CutlistMoveConflict[], allocations?: CutlistMoveAllocations) => CutlistDeleteOutcome;
  linkedPartCount: (id: string) => number;
  designReview?: ReactNode;
}) {
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [nameMode, setNameMode] = useState<'new' | 'rename' | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const previousActiveId = useRef(activeId);
  const focusAfterNameRef = useRef<'new' | 'rename' | null>(null);
  const lastFocusedActiveId = useRef(activeId);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const newActionRef = useRef<HTMLButtonElement>(null);
  const renameActionRef = useRef<HTMLButtonElement>(null);
  const selectorRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateCutlistMode>('independent');
  const [deleteError, setDeleteError] = useState('');
  const [deleteParts, setDeleteParts] = useState(false);
  const [deleteConflicts, setDeleteConflicts] = useState<CutlistMoveConflict[]>([]);
  const [moveResolutions, setMoveResolutions] = useState<CutlistMoveResolutions>({});
  const [moveAllocations, setMoveAllocations] = useState<CutlistMoveAllocations>({});
  const [destinationId, setDestinationId] = useState('');
  const allocationRows = new Map<string, { id: string; label: string; quantity: number; name: string }[]>();
  const active = lists.find(item => item.id === activeId) ?? lists[0];
  useEffect(() => {
    if (nameMode && expanded) nameInputRef.current?.focus();
    if (!nameMode && focusAfterNameRef.current) {
      const focusTarget = focusAfterNameRef.current;
      focusAfterNameRef.current = null;
      (focusTarget === 'new' ? newActionRef.current : renameActionRef.current)?.focus();
    }
  }, [nameMode, expanded]);
  useEffect(() => {
    if (lastFocusedActiveId.current !== active?.id) {
      lastFocusedActiveId.current = active?.id ?? '';
      selectorRef.current?.focus();
    }
  }, [active?.id]);
  if (previousActiveId.current !== active?.id) {
    previousActiveId.current = active?.id ?? '';
    if (nameMode === 'rename') {
      setNameMode(null);
      setRenameTargetId(null);
      setName('');
    }
  }
  if (!active) return null;
  const linkedCount = linkedPartCount(active.id);
  const submitName = (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (nameMode === 'rename' && renameTargetId === active.id) onRename(renameTargetId, next);
    else if (nameMode === 'new') onCreate(next);
    setName(''); setNameMode(null); setRenameTargetId(null);
    focusAfterNameRef.current = nameMode;
  };
  const openDelete = () => { setDeleteError(''); setDeleteConflicts([]); setMoveResolutions({}); setMoveAllocations({}); setDeleteParts(false); setDestinationId(lists.find(item => item.id !== active.id)?.id ?? ''); setDialogOpen(true); };
  const applyDelete = () => {
    const activeAllocationIds = new Set([...allocationRows.values()].flatMap(rows => rows.map(row => row.id)));
    const activeAllocations = Object.fromEntries(Object.entries(moveAllocations).filter(([id]) => activeAllocationIds.has(id)));
    const result = onDelete(active.id, destinationId, deleteParts, deleteConflicts.length ? moveResolutions : undefined, deleteConflicts.length ? deleteConflicts : undefined, deleteConflicts.length ? activeAllocations : undefined);
    if (result.kind === 'review') { setDeleteError(''); setDeleteConflicts(result.conflicts); setMoveResolutions({}); setMoveAllocations({}); return; }
    if (result.kind === 'error') { setDeleteError(result.message); return; }
    setDialogOpen(false); setDeleteError(''); setDeleteConflicts([]); setMoveResolutions({}); setMoveAllocations({});
  };
  if (!deleteParts && deleteConflicts.length && deleteConflicts.every(conflict => !!moveResolutions[conflict.id])) {
    const partIds = new Set(deleteConflicts.flatMap(conflict => [conflict.incomingPartId, conflict.existingPartId]));
    for (const partId of partIds) {
      const relevant = deleteConflicts.filter(conflict => conflict.incomingPartId === partId || conflict.existingPartId === partId);
      const sample = relevant[0];
      const incoming = sample.incomingPartId === partId;
      const sources = incoming ? sample.incomingSourceIds : sample.existingSourceIds;
      const quantity = incoming ? sample.incomingQuantity : sample.existingQuantity;
      const name = incoming ? sample.incomingName : sample.existingName;
      const shared = sources.filter(sourceId => relevant.some(conflict => conflict.overlappingInstanceIds.includes(sourceId) && (moveResolutions[conflict.id] === 'incoming' ? conflict.incomingPartId : conflict.existingPartId) === partId));
      const contested = new Set(relevant.flatMap(conflict => conflict.overlappingInstanceIds));
      const unshared = sources.filter(sourceId => !contested.has(sourceId));
      const segments = [
        ...(shared.length ? [{ id: cutlistMoveAllocationId(partId, 'shared'), label: 'shared components', quantity, name }] : []),
        ...(unshared.length ? [{ id: cutlistMoveAllocationId(partId, 'unshared'), label: 'unshared components', quantity, name }] : []),
      ];
      if (segments.length > 1 && quantity !== sources.length) allocationRows.set(partId, segments);
    }
  }
  const allocationsValid = [...allocationRows.values()].every(rows => rows.every(row => Number.isSafeInteger(moveAllocations[row.id]) && moveAllocations[row.id] >= 1) && rows.reduce((sum, row) => sum + moveAllocations[row.id], 0) === rows[0].quantity);
  const allocationImpossible = [...allocationRows.values()].some(rows => rows[0].quantity < rows.length);
  const allConflictsResolved = deleteConflicts.every(conflict => !!moveResolutions[conflict.id]) && (deleteParts || allocationRows.size === 0 || !allocationImpossible && allocationsValid);
  const beginName = (mode: 'new' | 'rename') => {
    setRenameTargetId(mode === 'rename' ? active.id : null);
    setName(mode === 'rename' ? active.name : '');
    setNameMode(mode);
    setExpanded(true);
  };
  const cancelName = () => {
    setNameMode(null); setRenameTargetId(null); setName('');
    focusAfterNameRef.current = nameMode;
  };
  return <section className="cutlist-manager" aria-label="Cutlist management">
    <div className="cutlist-manager-main">
      <label htmlFor="active-cutlist">Cutlist</label>
      <Select ref={selectorRef} id="active-cutlist" aria-label="Cutlist" className="cutlist-manager-select" value={active.id} onValueChange={onActiveChange} options={lists.map(item => ({ value: item.id, label: item.name }))} />
      {designReview}
      <button type="button" className="secondary compact cutlist-manager-toggle" aria-expanded={expanded} aria-controls="cutlist-manager-details" onClick={() => setExpanded(value => !value)}>{expanded ? 'Close' : 'Manage'}</button>
    </div>
    <div id="cutlist-manager-details" className={`collapsible-region cutlist-manager-details${expanded ? '' : ' is-collapsed'}`} aria-hidden={!expanded} inert={!expanded}>
      <div className="collapsible-region-inner cutlist-manager-details-inner">
      {nameMode && <form className="cutlist-manager-name-form" onSubmit={submitName} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelName(); } }}>
        <label htmlFor="cutlist-name">{nameMode === 'rename' ? 'New list name' : 'List name'}</label>
        <input ref={nameInputRef} id="cutlist-name" value={name} maxLength={256} onChange={event => setName(event.target.value)} required />
        <button className="primary compact" type="submit">{nameMode === 'rename' ? 'Save name' : 'Create list'}</button>
        <button className="secondary compact" type="button" onClick={cancelName}>Cancel</button>
      </form>}
      {!nameMode && <div className="cutlist-manager-actions">
        <button ref={newActionRef} type="button" className="secondary compact" onClick={() => beginName('new')}>New cutlist</button>
        <button ref={renameActionRef} type="button" className="secondary compact" onClick={() => beginName('rename')}>Rename</button>
        <button type="button" className="secondary compact" onClick={() => { setDuplicateMode('independent'); setDuplicateOpen(true); }}>Duplicate</button>
        <button type="button" className="secondary compact" onClick={openDelete} disabled={lists.length <= 1}>Delete</button>
      </div>}
      </div>
    </div>
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Portal><Dialog.Overlay className="project-info-overlay" /><Dialog.Content className="project-info-dialog" aria-describedby="delete-cutlist-description" onCloseAutoFocus={event => { event.preventDefault(); selectorRef.current?.focus(); }}>
        <Dialog.Title className="project-info-title">Delete “{active.name}”?</Dialog.Title>
        <Dialog.Description id="delete-cutlist-description" className="project-info-description">Choose what to do with its parts. The last cutlist must remain in the project.</Dialog.Description>
        <label className="cutlist-delete-option"><input type="radio" name="cutlist-delete-mode" checked={!deleteParts} onChange={() => { setDeleteParts(false); setDeleteConflicts([]); setMoveResolutions({}); setMoveAllocations({}); setDeleteError(''); }} /> Move parts to another cutlist</label>
        {!deleteParts && <label className="cutlist-delete-destination">Destination<Select aria-label="Destination cutlist" value={destinationId} onValueChange={value => { setDestinationId(value); setDeleteConflicts([]); setMoveResolutions({}); setMoveAllocations({}); setDeleteError(''); }} options={lists.filter(item => item.id !== active.id).map(item => ({ value: item.id, label: item.name }))} /></label>}
        <label className="cutlist-delete-option"><input type="radio" name="cutlist-delete-mode" checked={deleteParts} onChange={() => { setDeleteParts(true); setDeleteConflicts([]); setMoveResolutions({}); setMoveAllocations({}); setDeleteError(''); }} /> Delete its parts too</label>
        {deleteParts && linkedCount > 0 && <p className="cutlist-manager-help">{linkedCount} Design link{linkedCount === 1 ? '' : 's'} will be marked for removal. The destination cutlist will retain the Design review.</p>}
        {!deleteParts && linkedCount > 0 && <p className="cutlist-manager-help">{linkedCount} Design link{linkedCount === 1 ? '' : 's'} will move with the parts. Overlapping Design links in the destination will block the move for review.</p>}
        {deleteConflicts.length > 0 && <fieldset className="cutlist-move-review">
          <legend>Choose how to resolve linked rows</legend>
          <p>{deleteParts ? 'The source list parts will be deleted. Keep the existing destination row for shared components; unshared Design components are removed from the destination scope.' : 'For shared components, the selected row supplies the manual values. Unshared Design components keep their current row values. If a losing row has manual edits, it stays as an unlinked row when it has no components left.'}</p>
          {deleteConflicts.map(conflict => <div className="cutlist-move-conflict" key={conflict.id}>
            <strong>{conflict.kind === 'exact' ? 'Same Design components' : deleteParts ? 'Partial Design overlap · incoming-only components removed' : 'Partial Design overlap · rows split by component'}</strong>
            <label><input type="radio" name={`move-review-${conflict.id}`} checked={moveResolutions[conflict.id] === 'existing'} onChange={() => setMoveResolutions(value => ({ ...value, [conflict.id]: 'existing' }))} /> {deleteParts ? 'Delete incoming and keep existing' : conflict.kind === 'exact' ? 'Keep existing' : 'Use existing values for shared components'}: {conflict.existingName}</label>
            {!deleteParts && <label><input type="radio" name={`move-review-${conflict.id}`} checked={moveResolutions[conflict.id] === 'incoming'} onChange={() => setMoveResolutions(value => ({ ...value, [conflict.id]: 'incoming' }))} /> {conflict.kind === 'exact' ? 'Use incoming' : 'Use incoming values for shared components'}: {conflict.incomingName}</label>}
          </div>)}
        </fieldset>}
        {allocationRows.size > 0 && <fieldset className="cutlist-move-review cutlist-move-allocation">
          <legend>Allocate manual quantities</legend>
          <p>These linked rows will become separate shared and unshared rows. Allocate each original manual quantity explicitly; each total must stay unchanged.</p>
          {allocationImpossible && <p className="warning" role="alert">At least one row has too few items to give every resulting row a positive quantity. Change the overlap choices so that row stays in one part, or cancel and resolve the overlap in Design.</p>}
          {[...allocationRows.entries()].map(([partId, rows]) => <div className="cutlist-move-conflict" key={partId}>
            <strong>{rows[0].name}</strong>
            {rows.map(row => <label key={row.id}>{row.label} quantity<input type="number" min="1" step="1" value={moveAllocations[row.id] || ''} aria-label={`${row.name} ${row.label} quantity`} onChange={event => setMoveAllocations(value => ({ ...value, [row.id]: event.target.value === '' ? 0 : Number(event.target.value) }))} /></label>)}
            <span>Original total: {rows[0].quantity} · Allocated: {rows.reduce((sum, row) => sum + (moveAllocations[row.id] ?? 0), 0)}</span>
          </div>)}
        </fieldset>}
        {deleteError && <p className="warning" role="alert">{deleteError}</p>}
        <div className="project-info-actions"><button type="button" className="secondary" onClick={() => { setDialogOpen(false); setDeleteError(''); setDeleteConflicts([]); }}>Cancel</button><button type="button" className="primary compact" disabled={!deleteParts && (!destinationId || deleteConflicts.length > 0 && !allConflictsResolved) || deleteParts && deleteConflicts.length > 0 && !allConflictsResolved} onClick={applyDelete}>{deleteConflicts.length ? deleteParts ? 'Apply reviewed deletion' : 'Apply reviewed move' : 'Delete cutlist'}</button></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={duplicateOpen} onOpenChange={setDuplicateOpen}>
      <Dialog.Portal><Dialog.Overlay className="project-info-overlay" /><Dialog.Content className="project-info-dialog" aria-describedby="duplicate-cutlist-description">
        <Dialog.Title className="project-info-title">Duplicate “{active.name}”</Dialog.Title>
        <Dialog.Description id="duplicate-cutlist-description" className="project-info-description">Choose whether copied rows should remain connected to their Design components.</Dialog.Description>
        <label className="cutlist-delete-option"><input type="radio" name="cutlist-duplicate-mode" checked={duplicateMode === 'independent'} onChange={() => setDuplicateMode('independent')} /> Independent copy</label>
        <p className="cutlist-manager-help">Copied rows keep their current values and do not sync with Design.</p>
        <label className="cutlist-delete-option"><input type="radio" name="cutlist-duplicate-mode" checked={duplicateMode === 'linked'} disabled={linkedCount === 0} onChange={() => setDuplicateMode('linked')} /> Linked copy</label>
        <p className="cutlist-manager-help">{linkedCount > 0 ? `Preserve ${linkedCount} Design link${linkedCount === 1 ? '' : 's'} on copied rows. Planning both lists together will require review of shared Design components.` : 'This list has no Design-linked rows to preserve.'}</p>
        <div className="project-info-actions"><button type="button" className="secondary" onClick={() => setDuplicateOpen(false)}>Cancel</button><button type="button" className="primary compact" onClick={() => { onDuplicate(active.id, duplicateMode); setDuplicateOpen(false); }}>Duplicate list</button></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </section>;
}
