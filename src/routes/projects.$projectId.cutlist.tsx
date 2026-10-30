/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/refs */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { DropdownMenu } from 'radix-ui';
import { CaretDown } from '@phosphor-icons/react';
import { exportProject, importProject, parseFractionalInches, restoreProjectDocument, umFromInches, umFromMillimeters, type Material, type Project, type StockOption } from '@/lib/planner/model';
import { optimizeMixedProject } from '@/lib/planner/combined';
import { exportCutCsv } from '@/lib/planner/exports';
import { projectRepository } from '@/lib/planner/repository.indexeddb';
import type { ConcurrencyToken } from '@/lib/planner/repository';
import { PageSkeleton, useProjectShell } from '@/components/ProjectWorkspaceShell';
import { ProjectInfoDialog, type ProjectInfoDraft } from '@/components/ProjectInfoDialog';
import { Select } from '@/components/ui/select';
import { PartTypeField, PartLumberField, PartCustomSize } from '@/components/cutlist/PartSizeSettings';
import { partKind } from '@/lib/planner/part-stock';
import { PartDisclosure } from '@/components/cutlist/PartDisclosure';
import { NumberStepper } from '@/components/ui/number-stepper';
import { dropEditorItem, getEditorDropIntent, type EditorDropIntent, insertEditorCopy, moveEditorItem, removeEditorId, resolveEditorOrder, withEditorOrder } from '@/lib/planner/editor-order';
import { StockCreationForm } from '@/components/cutlist/StockCreationForm';
import { MaterialTypeToggle } from '@/components/cutlist/MaterialTypeToggle';
import { CutPlan } from '@/components/cutlist/CutPlan';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { DeleteConfirmationDialog, type DeleteConfirmation } from '@/components/DeleteConfirmationDialog';

export const Route = createFileRoute('/projects/$projectId/cutlist')({ component: Cutlist });

const PROJECT_SETTINGS_EXPANDED_KEY = 'plankplan-studio.project-settings-expanded.v1';

function getProjectSettingsExpanded() {
  try { return window.localStorage.getItem(PROJECT_SETTINGS_EXPANDED_KEY) !== 'false'; }
  catch { return true; }
}

function Cutlist() {
  const shell = useProjectShell();
  const setShellProject = shell.setProject;
  const setShellStatus = shell.setStatus;
  const { projectId } = Route.useParams();
  const [all, setAll] = useState<Project[]>([]);
  const [loadStatus, setLoadStatus] = useState('Loading project…');
  const tokenRef = useRef<ConcurrencyToken | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const [saveStatus, setSaveStatus] = useState('');
  const [newPartMaterialId, setNewPartMaterialId] = useState('');
  const [materialFormOpen, setMaterialFormOpen] = useState(true);
  const [stockFormMaterialId, setStockFormMaterialId] = useState<string | null>(null);
  const [collapsedMaterialIds, setCollapsedMaterialIds] = useState<Set<string>>(() => new Set());
  const [collapsedStockIds, setCollapsedStockIds] = useState<Set<string>>(() => new Set());
  const [planExpanded, setPlanExpanded] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'cutting' | 'currency'>('cutting');
  const [projectSettingsExpanded, setProjectSettingsExpanded] = useState(getProjectSettingsExpanded);
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, string>>({});
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [projectInfoDraft, setProjectInfoDraft] = useState<ProjectInfoDraft>({ name: '', notes: '', unitSystem: 'imperial', previewView: 'auto' });
  const [projectInfoError, setProjectInfoError] = useState('');
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [draggingKind, setDraggingKind] = useState<'parts' | 'materials' | 'stocks' | null>(null);
  const [draggingMaterialId, setDraggingMaterialId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; intent: EditorDropIntent } | null>(null);
  const [orderAnnouncement, setOrderAnnouncement] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState<{ kind: 'part' | 'material' | 'stock'; id: string } | null>(null);
  const deletionTriggerId = useRef<string | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<Project | null>(null);
  const [importError, setImportError] = useState('');
  useEffect(() => {
    const load=async()=>{const result=await projectRepository.get({namespaceId:'local',projectId});if(result.ok){setAll([result.value]);tokenRef.current=result.token;setLoadStatus('');}else setLoadStatus(result.kind==='not-found'?'Project not found.':'Project could not be opened. Your saved data has not been changed.');};
    void load();
    return projectRepository.subscribe('local',changed=>{if(changed.some(key=>key.projectId===projectId))void load();});
  },[projectId]);
  const project = all.find(p => p.id === projectId);
  useEffect(() => {
    if (project) setShellProject(project.name, saveStatus || 'Saved locally', () => { setProjectInfoDraft({ name: project.name, notes: project.notes ?? '', unitSystem: project.unitSystem, previewView: project.previewView ?? 'auto' }); setProjectInfoError(''); setProjectInfoOpen(true); });
    else if (loadStatus.startsWith('Project not found') || loadStatus.startsWith('Project could not')) setShellStatus(loadStatus);
  }, [project, saveStatus, loadStatus, setShellProject, setShellStatus]);
  const update = (nextProject: Project) => {
    const savedProject = { ...nextProject, parts: nextProject.parts.map(part => Object.fromEntries(Object.entries(part).filter(([, value]) => value !== undefined)) as typeof part), updatedAt: new Date().toISOString() };
    setAll([savedProject]);
    const captured = savedProject;
    saveQueue.current = saveQueue.current.then(async () => {
      const expected=tokenRef.current;
      if(!expected){setSaveStatus('Not saved · project must be reloaded');return;}
      const result=await projectRepository.save({namespaceId:'local',projectId},captured,expected);
      if(result.ok){tokenRef.current=result.token;setSaveStatus('Saved');}
      else setSaveStatus(result.kind==='conflict'?'Conflict · newer project data exists. Reload before saving.':result.kind==='quota'?'Not saved · storage is full. Your edits remain here.':'Not saved · your edits remain here. Retry after checking storage.');
    });
  };
  const saveProjectInfo = (currentProject: Project) => {
    const name = projectInfoDraft.name.trim();
    if (!name) { setProjectInfoError('Enter a project name.'); return; }
    if (name.length > 256) { setProjectInfoError('Project names must be 256 characters or fewer.'); return; }
    if (projectInfoDraft.notes.length > 16384) { setProjectInfoError('Notes must be 16,384 characters or fewer.'); return; }
    const nextProject = { ...currentProject, name, unitSystem: projectInfoDraft.unitSystem, previewView: projectInfoDraft.previewView };
    if (projectInfoDraft.notes) nextProject.notes = projectInfoDraft.notes;
    else delete nextProject.notes;
    update(nextProject);
    setDimensionDrafts({});
    setProjectInfoOpen(false);
  };
  const orderedParts = project ? resolveEditorOrder(project.parts, project.editorOrder?.parts) : [];
  const orderedMaterials = project ? resolveEditorOrder(project.materials, project.editorOrder?.materials) : [];
  const orderedStocks = (material: Material) => resolveEditorOrder(material.stocks, project?.editorOrder?.stocks?.[material.id]);
  const announceMove = (name: string, direction: -1 | 1) => setOrderAnnouncement(`${name} moved ${direction < 0 ? 'up' : 'down'}.`);
  const moveItem = (kind: 'parts' | 'materials' | 'stocks', id: string, direction: -1 | 1, materialId?: string) => {
    if (!project) return;
    const ids = kind === 'parts' ? orderedParts.map(item => item.id) : kind === 'materials' ? orderedMaterials.map(item => item.id) : orderedStocks(project.materials.find(item => item.id === materialId)!).map(item => item.id);
    const nextIds = moveEditorItem(ids, id, direction);
    if (nextIds !== ids) update({ ...project, editorOrder: withEditorOrder(project.editorOrder, kind === 'stocks' ? { stocks: { ...project.editorOrder?.stocks, [materialId!]: nextIds } } : { [kind]: nextIds }) });
  };
  const reorderByDrop = (kind: 'parts' | 'materials' | 'stocks', sourceId: string, targetId: string, intent: EditorDropIntent, materialId?: string) => {
    if (!project || sourceId === targetId) return;
    const ids = kind === 'parts' ? orderedParts.map(item => item.id) : kind === 'materials' ? orderedMaterials.map(item => item.id) : orderedStocks(project.materials.find(item => item.id === materialId)!).map(item => item.id);
    const from = ids.indexOf(sourceId); const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const nextIds = dropEditorItem(ids, sourceId, targetId, intent);
    const itemName = kind === 'parts' ? project.parts.find(item => item.id === sourceId)?.name : kind === 'materials' ? project.materials.find(item => item.id === sourceId)?.name : project.materials.find(item => item.id === materialId)?.stocks.find(item => item.id === sourceId)?.name;
    update({ ...project, editorOrder: withEditorOrder(project.editorOrder, kind === 'stocks' ? { stocks: { ...project.editorOrder?.stocks, [materialId!]: nextIds } } : { [kind]: nextIds }) });
    setOrderAnnouncement(`${itemName ?? 'Item'} moved to a new position.`);
  };
  const clearDrag = () => {
    setDraggingItem(null); setDraggingKind(null); setDraggingMaterialId(null); setDropTarget(null);
  };
  const dropProps = (kind: 'parts' | 'materials' | 'stocks', id: string, materialId?: string) => {
    const valid = draggingKind === kind && !!draggingItem && draggingItem !== id && (kind !== 'stocks' || draggingMaterialId === materialId);
    const intentAt = (event: DragEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return getEditorDropIntent(event.clientY, rect.top, rect.height);
    };
    return {
      'data-drop-intent': dropTarget?.id === id ? dropTarget.intent : undefined,
      'data-swap-source': draggingKind === kind && draggingItem === id && dropTarget?.intent === 'swap' ? true : undefined,
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        // Let material drags bubble through their nested stock rows.
        if (kind === 'stocks' && draggingKind === 'materials') return;
        event.stopPropagation();
        if (!valid) { setDropTarget(null); return; }
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        const intent = intentAt(event);
        setDropTarget(current => current?.id === id && current.intent === intent ? current : { id, intent });
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setDropTarget(current => current?.id === id ? null : current);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        if (kind === 'stocks' && draggingKind === 'materials') return;
        event.stopPropagation();
        if (!valid) return;
        event.preventDefault();
        reorderByDrop(kind, draggingItem!, id, intentAt(event), materialId);
        clearDrag();
      },
    };
  };
  const dragHandle = (kind: 'parts' | 'materials' | 'stocks', id: string, label: string, materialId?: string) => <button type="button" className="reorder-handle" aria-label={`Reorder ${label}`} title="Drag: top to insert above, middle to swap, bottom to insert below" draggable onDragStart={event => { event.stopPropagation(); setDropTarget(null); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); setDraggingItem(id); setDraggingKind(kind); setDraggingMaterialId(materialId ?? null); }} onDragEnd={clearDrag}>⠿</button>;
  const quickActions = (kind: 'part' | 'material' | 'stock', label: string, id: string, position: number, count: number, actions: { move: (direction: -1 | 1) => void; duplicate: () => void; remove: () => void }) => <DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild><button id={`${kind}-actions-${id}`} type="button" className="quick-actions-trigger" aria-label={`${label} actions`} aria-haspopup="menu">⋯</button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="quick-actions-menu" align="end" sideOffset={5}><DropdownMenu.Item disabled={position === 0} onSelect={() => actions.move(-1)}>Move up</DropdownMenu.Item><DropdownMenu.Item disabled={position === count - 1} onSelect={() => actions.move(1)}>Move down</DropdownMenu.Item><DropdownMenu.Item onSelect={actions.duplicate}>Duplicate</DropdownMenu.Item><DropdownMenu.Separator/><DropdownMenu.Item className="destructive-action" onSelect={actions.remove}>Delete</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
  const closeMaterialForm = () => {
    document.getElementById('add-material')?.focus();
    setMaterialFormOpen(false);
  };
  const toggleProjectSettings = () => {
    const nextExpanded = !projectSettingsExpanded;
    setProjectSettingsExpanded(nextExpanded);
    try { window.localStorage.setItem(PROJECT_SETTINGS_EXPANDED_KEY, String(nextExpanded)); }
    catch { /* Keep the control usable when browser storage is unavailable. */ }
  };
  const mixedResult = useMemo(() => { const currentProject = all.find(item => item.id === projectId); return currentProject ? optimizeMixedProject(currentProject) : null; }, [all, projectId]);
  const result = mixedResult?.linear ?? null;
  const sheetResult = mixedResult?.sheets ?? null;
  if (!project) return <>{loadStatus.startsWith('Project not found') || loadStatus.startsWith('Project could not') ? <section className="project-load-error"><h1>{loadStatus}</h1><button type="button" onClick={() => { setLoadStatus('Loading project…'); void projectRepository.get({namespaceId:'local',projectId}).then(r=>{if(r.ok){setAll([r.value]);tokenRef.current=r.token;setLoadStatus('');}else setLoadStatus(r.kind==='not-found'?'Project not found.':'Project could not be opened.');}); }}>Retry</button></section> : <PageSkeleton page="cutlist" />}</>;

  const deletionTarget: DeleteConfirmation | null = pendingDeletion?.kind === 'part'
    ? (() => { const item = project.parts.find(candidate => candidate.id === pendingDeletion.id); return item ? { kind: 'part', id: item.id, name: item.name } : null; })()
    : pendingDeletion?.kind === 'material'
      ? (() => { const item = project.materials.find(candidate => candidate.id === pendingDeletion.id); return item ? { kind: 'material', id: item.id, name: item.name, assignedPartCount: project.parts.filter(part => part.materialId === item.id).length } : null; })()
      : pendingDeletion?.kind === 'stock'
        ? (() => { const item = project.materials.flatMap(material => material.stocks).find(candidate => candidate.id === pendingDeletion.id); return item ? { kind: 'stock', id: item.id, name: item.name, assignedPartCount: project.parts.filter(part => part.stockId === item.id).length } : null; })()
        : null;

  const stockOptions = [{ value: '', label: 'Generic / unassigned' }, ...project.materials.flatMap(material => material.stocks.map(stock => ({ value: stock.id, label: `${material.name} · ${stock.name}` })))];
  const addPart = () => {
    const entry = project.materials.flatMap(material => material.stocks.map(stock => ({ material, stock }))).find(item => item.stock.id === newPartMaterialId);
    const material = entry?.material;
    update({ ...project, parts: [...project.parts, { id: crypto.randomUUID(), name: `Part ${project.parts.length + 1}`, materialId: material?.id ?? '', kind: material?.type ?? 'linear', stockId: entry?.stock.id, ...(material?.type === 'linear' && entry?.stock.widthUm && entry.stock.thicknessUm ? { crossSection: { width: { um: entry.stock.widthUm }, thickness: { um: entry.stock.thicknessUm } } } : {}), length: { um: umFromInches(24) }, ...(material?.type === 'sheet' ? { width: { um: project.unitSystem === 'imperial' ? umFromInches(12) : umFromMillimeters(300) } } : {}), quantity: 1 }] });
  };
  const updateMaterial = (materialId: string, updateFn: (material: Material) => Material) => update({ ...project, materials: project.materials.map(m => m.id === materialId ? updateFn(m) : m) });
  const updateStock = (materialId: string, stockId: string, updateFn: (stock: StockOption) => StockOption) => updateMaterial(materialId, m => ({ ...m, stocks: m.stocks.map(s => s.id === stockId ? updateFn(s) : s) }));
  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([exportProject(project)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.name || 'project'}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const downloadCsv = () => {
    if (!result || !sheetResult) return;
    const url = URL.createObjectURL(new Blob([exportCutCsv(project, result.plans, sheetResult.plans)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.name || 'project'}-cutlist.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    setImportError('');
    try { setPendingReplacement(importProject(await file.text())); }
    catch { setImportError('This project backup could not be imported. Check that it is a valid PlankPlan JSON backup.'); }
  };
  const dimValue = (um: number) => project.unitSystem === 'imperial' ? (um / 25400).toFixed(3) : (um / 1000).toFixed(1);
  const dimFromValue = (value: string) => project.unitSystem === 'imperial' ? parseFractionalInches(value) : umFromMillimeters(Number(value));
  const dimensionProps = (key: string, um: number, setter: (um: number) => void, label: string) => ({
    id: `number-stepper-${key}`,
    value: dimensionDrafts[key] ?? dimValue(um),
    onChange: (event: ChangeEvent<HTMLInputElement>) => setDimensionDrafts(drafts => ({ ...drafts, [key]: event.target.value })),
    onStep: (steps: number) => {
      let base = um;
      const draft = dimensionDrafts[key];
      if (draft !== undefined) {
        try { const parsed = dimFromValue(draft); if (Number.isSafeInteger(parsed) && parsed > 0) base = parsed; }
        catch { /* Use the last saved value for an incomplete draft. */ }
      }
      const incrementUm = project.unitSystem === 'imperial' ? 25400 / 16 : 1000;
      const nextUm = Math.max(1, Math.round(base + incrementUm * steps));
      setDimensionDrafts(drafts => { const next = { ...drafts }; delete next[key]; return next; });
      setter(nextUm);
    },
    'aria-label': label,
    onBlur: () => {
      const draft = dimensionDrafts[key];
      if (draft === undefined) return;
      try { const nextUm = dimFromValue(draft); if (Number.isSafeInteger(nextUm) && nextUm > 0) setter(nextUm); } catch { /* Leave the last valid stored dimension intact. */ }
      setDimensionDrafts(drafts => { const next = { ...drafts }; delete next[key]; return next; });
    },
  });
  const restoreImportFocus = () => document.getElementById('replace-project-json')?.focus();
  return <>
    <ConfirmationDialog open={pendingReplacement !== null} title="Replace project from JSON?" description={`Replace the current project “${project.name}” with “${pendingReplacement?.name ?? ''}”? This replaces all its saved Design and Cutlist contents and cannot be undone.`} confirmLabel="Replace project" onOpenChange={open => { if (!open) setPendingReplacement(null); }} restoreFocus={restoreImportFocus} onConfirm={() => {
      if (!pendingReplacement) return;
      update(restoreProjectDocument(project, pendingReplacement));
      setPendingReplacement(null);
      setDimensionDrafts({});
      window.setTimeout(restoreImportFocus, 0);
    }} />
    <ProjectInfoDialog open={projectInfoOpen} onOpenChange={setProjectInfoOpen} project={project} draft={projectInfoDraft} onDraftChange={setProjectInfoDraft} error={projectInfoError} onSave={() => saveProjectInfo(project)} />
    <DeleteConfirmationDialog deletion={deletionTarget} onOpenChange={open => { if (!open) setPendingDeletion(null); }} restoreFocus={() => { const triggerId = deletionTriggerId.current; if (triggerId) document.getElementById(triggerId)?.focus(); }} onConfirm={() => {
      const deletion = pendingDeletion;
      if (!deletion) return;
      const current = all.find(item => item.id === projectId);
      deletionTriggerId.current = null;
      setPendingDeletion(null);
      if (!current) return;
      if (deletion.kind === 'part') {
        const target = current.parts.find(item => item.id === deletion.id);
        if (!target) return;
        const currentOrder = resolveEditorOrder(current.parts, current.editorOrder?.parts);
        const index = currentOrder.findIndex(item => item.id === target.id);
        const survivor = currentOrder[index === 0 ? 1 : index - 1];
        update({ ...current, parts: current.parts.filter(item => item.id !== target.id), editorOrder: withEditorOrder(current.editorOrder, { parts: removeEditorId(currentOrder.map(item => item.id), target.id) }) });
        setOrderAnnouncement(`${target.name} deleted.`);
        window.setTimeout(() => (survivor ? document.getElementById(`part-name-${survivor.id}`) : document.getElementById('add-part'))?.focus(), 0);
      } else if (deletion.kind === 'material') {
        const target = current.materials.find(item => item.id === deletion.id);
        if (!target) return;
        const currentMaterials = resolveEditorOrder(current.materials, current.editorOrder?.materials);
        const index = currentMaterials.findIndex(item => item.id === target.id);
        const survivor = currentMaterials[index === 0 ? 1 : index - 1];
        const remainingParts = current.parts.filter(part => part.materialId !== target.id);
        const currentParts = resolveEditorOrder(current.parts, current.editorOrder?.parts);
        update({ ...current, materials: current.materials.filter(item => item.id !== target.id), parts: remainingParts, editorOrder: withEditorOrder(current.editorOrder, { materials: removeEditorId(currentMaterials.map(item => item.id), target.id), parts: currentParts.filter(part => part.materialId !== target.id).map(part => part.id) }) });
        setOrderAnnouncement(`${target.name} deleted.`);
        window.setTimeout(() => (survivor ? document.getElementById(`material-name-${survivor.id}`) : document.getElementById('add-material'))?.focus(), 0);
      } else {
        const material = current.materials.find(item => item.stocks.some(stock => stock.id === deletion.id));
        const target = material?.stocks.find(stock => stock.id === deletion.id);
        if (!material || !target) return;
        const stocks = resolveEditorOrder(material.stocks, current.editorOrder?.stocks?.[material.id]);
        const index = stocks.findIndex(stock => stock.id === target.id);
        const survivor = stocks[index === 0 ? 1 : index - 1];
        const ids = removeEditorId(stocks.map(stock => stock.id), target.id);
        update({ ...current, materials: current.materials.map(item => item.id === material.id ? { ...item, stocks: item.stocks.filter(stock => stock.id !== target.id) } : item), parts: current.parts.map(part => part.stockId === target.id ? { ...part, kind: partKind(part, current), stockId: undefined, materialId: '' } : part), editorOrder: withEditorOrder(current.editorOrder, { stocks: { ...current.editorOrder?.stocks, [material.id]: ids } }) });
        setOrderAnnouncement(`${target.name} deleted.`);
        window.setTimeout(() => (survivor ? document.getElementById(`stock-name-${survivor.id}`) : document.getElementById(`add-stock-${material.id}`))?.focus(), 0);
      }
    }} />
      <div className="workspace-head cutlist-workspace-head">
      <div className="workspace-actions cutlist-action-row"><div className="cutlist-export-actions"><button className="secondary compact" onClick={downloadBackup}>Export JSON</button><label className="secondary compact import-backup">Replace from JSON<input id="replace-project-json" type="file" accept="application/json,.json" aria-label="Replace project from JSON" onChange={e => { void importBackup(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label><button className="secondary compact" onClick={downloadCsv}>Export CSV</button><button className="secondary compact" onClick={() => window.print()}>Print / Save PDF</button></div></div>
    </div>
    {importError && <p className="warning" role="alert">{importError}</p>}
    <div className={`workspace-grid ${planExpanded ? 'plan-expanded' : ''}`}><section className="editor-column">
      <section className="panel parts-editor-panel"><div className="panel-title"><div><p className="eyebrow">01 · PARTS</p><h2>What are you making?</h2></div><div className="parts-panel-actions"><button className="secondary compact settings-toggle" type="button" aria-expanded={projectSettingsExpanded} aria-controls="project-settings" onClick={toggleProjectSettings}><span className="stable-toggle-label" data-width-label="Show settings">{projectSettingsExpanded ? 'Hide settings' : 'Show settings'}</span></button><div className="parts-add-controls"><Select aria-label="Stock for new parts" value={project.materials.some(material => material.stocks.some(stock => stock.id === newPartMaterialId)) ? newPartMaterialId : ''} onValueChange={setNewPartMaterialId} options={stockOptions}/><button id="add-part" className="primary compact" onClick={addPart}>＋ Add part</button></div></div></div>
        <div className={`project-settings ${projectSettingsExpanded ? 'expanded' : 'collapsed'}`} id="project-settings" aria-hidden={!projectSettingsExpanded} inert={!projectSettingsExpanded}>
          <div className="project-settings-content">
          <div className="settings-tabs" role="tablist" aria-label="Project settings" onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault();
            const nextTab = event.key === 'Home' ? 'cutting' : event.key === 'End' ? 'currency' : settingsTab === 'cutting' ? 'currency' : 'cutting';
            setSettingsTab(nextTab);
            event.currentTarget.querySelector<HTMLButtonElement>(`[data-settings-tab="${nextTab}"]`)?.focus();
          }}>
            <button id="settings-tab-cutting" data-settings-tab="cutting" type="button" role="tab" tabIndex={settingsTab === 'cutting' ? 0 : -1} aria-selected={settingsTab === 'cutting'} aria-controls="project-settings-panel" className={settingsTab === 'cutting' ? 'settings-tab active' : 'settings-tab'} onClick={() => setSettingsTab('cutting')}>Cutting</button>
            <button id="settings-tab-currency" data-settings-tab="currency" type="button" role="tab" tabIndex={settingsTab === 'currency' ? 0 : -1} aria-selected={settingsTab === 'currency'} aria-controls="project-settings-panel" className={settingsTab === 'currency' ? 'settings-tab active' : 'settings-tab'} onClick={() => setSettingsTab('currency')}>Currency &amp; tax</button>
          </div>
          <div id="project-settings-panel" role="tabpanel" aria-labelledby={settingsTab === 'cutting' ? 'settings-tab-cutting' : 'settings-tab-currency'} tabIndex={0}>
          <div className="settings-panel-layout"><div className="units-row" aria-hidden={settingsTab !== 'cutting'} inert={settingsTab !== 'cutting'}>
            <label>Units<Select aria-label="Units" value={project.unitSystem} onValueChange={value => { setDimensionDrafts({}); update({ ...project, unitSystem: value as Project['unitSystem'] }); }} options={[{ value: 'imperial', label: 'Imperial · inches' }, { value: 'metric', label: 'Metric · mm' }]}/></label>
            <div className="number-field"><label htmlFor="number-stepper-kerf">Kerf</label><NumberStepper {...dimensionProps('kerf', project.kerf.um, um => update({ ...project, kerf: { um } }), 'Kerf')}/></div>
            <div className="number-field"><label htmlFor="number-stepper-trim">End trim</label><NumberStepper {...dimensionProps('trim', project.trim.um, um => update({ ...project, trim: { um } }), 'End trim')}/></div>
            <div className="number-field"><label htmlFor="number-stepper-minOffcut">Minimum usable offcut ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper min="0" {...dimensionProps('minOffcut', project.minOffcutLinear.um, um => update({ ...project, minOffcutLinear: { um } }), 'Minimum usable offcut')}/></div>
          </div><div className="units-row currency-row" aria-hidden={settingsTab !== 'currency'} inert={settingsTab !== 'currency'}>
            <label>Currency<Select aria-label="Project currency" value={project.currency} onValueChange={value => update({ ...project, currency: value as Project['currency'] })} options={[{ value: 'CAD', label: 'CAD · Canadian dollar' }, { value: 'USD', label: 'USD · US dollar' }, { value: 'EUR', label: 'EUR · Euro' }, { value: 'GBP', label: 'GBP · Pound sterling' }]}/></label>
            <div className="number-field"><label htmlFor="number-stepper-taxRate">Tax (%)</label><NumberStepper id="number-stepper-taxRate" aria-label="Tax rate" type="number" min="0" max="100" step="0.01" value={project.taxRate ?? ''} placeholder="None" onChange={e => update({ ...project, taxRate: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) })} onStep={steps => update({ ...project, taxRate: Math.min(100, Math.max(0, Math.round(((project.taxRate ?? 0) + steps * 0.01) * 100) / 100)) })}/></div>
          </div></div>
          </div>
          </div>
        </div>
        {orderedParts.length ? <div className="parts-list">{orderedParts.map((part, partIndex) => { const sheetPart = partKind(part, project) === 'sheet'; return <div className="part-row reorderable-row" key={part.id} {...dropProps('parts', part.id)} >
          <PartDisclosure partId={part.id} partName={part.name} sheetPart={sheetPart} handle={dragHandle('parts', part.id, part.name)} identity={<><label className="part-name-field">Part name<input id={`part-name-${part.id}`} aria-label="Part name" value={part.name} onChange={e => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, name: e.target.value } : p) })}/></label><PartTypeField part={part} project={project} onChange={next => update({ ...project, parts: project.parts.map(item => item.id === part.id ? next : item) })}/></>} dimensions={<><PartLumberField part={part} project={project} onChange={next => update({ ...project, parts: project.parts.map(item => item.id === part.id ? next : item) })}/><div className="number-field part-length-field"><label htmlFor={`number-stepper-part-${part.id}`}>Length ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper {...dimensionProps(`part-${part.id}`, part.length.um, um => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, length: { um } } : p) }), 'Part length')}/></div><div className={`part-optional-width ${sheetPart ? 'is-visible' : ''}`} inert={!sheetPart} aria-hidden={!sheetPart}><div className="number-field"><label htmlFor={`number-stepper-part-width-${part.id}`}>Width ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper {...dimensionProps(`part-width-${part.id}`, part.width?.um ?? 0, um => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, width: { um } } : p) }), 'Part width')}/></div></div></>} quantity={<div className="number-field part-quantity-field"><label htmlFor={`number-stepper-part-quantity-${part.id}`}>Qty</label><NumberStepper id={`number-stepper-part-quantity-${part.id}`} aria-label="Part quantity" type="number" min="1" value={part.quantity} onChange={e => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : p) })} onStep={steps => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, quantity: Math.max(1, part.quantity + steps) } : p) })}/></div>} details={<>{partKind(part, project) === 'linear' && part.lumberPreset === 'custom' && <PartCustomSize part={part} project={project} onChange={next => update({ ...project, parts: project.parts.map(item => item.id === part.id ? next : item) })}/>}<label>Group<input aria-label="Part group" value={part.group ?? ''} onChange={e => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, group: e.target.value || undefined } : p) })}/></label><label>Stock option<Select aria-label="Part stock option" value={part.stockId ?? (part.kind === undefined && part.materialId ? `legacy:${part.materialId}` : '')} onValueChange={value => { if (value.startsWith('legacy:')) return; const material = project.materials.find(item => item.stocks.some(stock => stock.id === value)); const stock = material?.stocks.find(item => item.id === value); update({ ...project, parts: project.parts.map(item => item.id === part.id ? { ...item, kind: partKind(part, project), materialId: material?.id ?? '', stockId: value || undefined, ...(!item.crossSection && material?.type === 'linear' && stock?.widthUm && stock.thicknessUm ? { crossSection: { width: { um: stock.widthUm }, thickness: { um: stock.thicknessUm } } } : {}) } : item) }); }} options={[...(part.kind === undefined && part.materialId ? [{ value: `legacy:${part.materialId}`, label: `${project.materials.find(material => material.id === part.materialId)?.name ?? 'Material'} · any stock (existing)` }] : []), ...stockOptions.filter(option => !option.value || project.materials.some(material => material.type === partKind(part, project) && material.stocks.some(stock => stock.id === option.value && (!part.crossSection || material.type === 'sheet' || stock.widthUm === part.crossSection.width.um && stock.thicknessUm === part.crossSection.thickness.um))))]}/></label><label className={`grain-lock part-optional-grain ${sheetPart ? 'is-visible' : ''}`} inert={!sheetPart} aria-hidden={!sheetPart}><input aria-label={`Grain locked ${part.name}`} type="checkbox" checked={part.grainLocked ?? false} onChange={e => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, grainLocked: e.target.checked } : p) })}/> Grain locked</label><label>Notes<input aria-label="Part notes" value={part.notes ?? ''} onChange={e => update({ ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, notes: e.target.value || undefined } : p) })}/></label></>} actions={quickActions('part', part.name, part.id, partIndex, orderedParts.length, { move: direction => { moveItem('parts', part.id, direction); announceMove(part.name, direction); }, duplicate: () => { const id = crypto.randomUUID(); const copy = { ...part, id, name: `${part.name} copy` }; const ids = insertEditorCopy(orderedParts.map(item => item.id), part.id, id); update({ ...project, parts: [...project.parts, copy], editorOrder: withEditorOrder(project.editorOrder, { parts: ids }) }); setOrderAnnouncement(`${copy.name} duplicated.`); window.setTimeout(() => document.getElementById(`part-name-${id}`)?.focus(), 0); }, remove: () => { deletionTriggerId.current = `part-actions-${part.id}`; setPendingDeletion({ kind: 'part', id: part.id }); } })} /></div>; })}</div> : <p className="muted">Add parts to start planning your cuts.</p>}<div className="sr-only" role="status" aria-live="polite">{orderAnnouncement}</div>
      </section>
      <section className="panel"><div className="panel-title materials-panel-title"><div><p className="eyebrow">02 · MATERIALS & STOCK</p><h2>Set your stock and price</h2></div><button id="add-material" className="secondary compact material-form-toggle" aria-expanded={materialFormOpen} aria-controls="material-creation-form" onClick={() => setMaterialFormOpen(open => !open)}><svg aria-hidden="true" viewBox="0 0 16 16" className={materialFormOpen ? 'is-expanded' : ''}><path d="m3.5 6 4.5 4 4.5-4"/></svg><span className="stable-toggle-label" data-width-label="Show material form">{materialFormOpen ? 'Hide material form' : 'Show material form'}</span></button></div>
        <div id="material-creation-form" className={`collapsible-region ${materialFormOpen ? '' : 'is-collapsed'}`} aria-hidden={!materialFormOpen} inert={!materialFormOpen}><div className="collapsible-region-inner"><StockCreationForm key={project.materials.length} mode="material" unitSystem={project.unitSystem} defaultMaterialName={`Material ${project.materials.length + 1}`} onCancel={closeMaterialForm} onCreate={(stock, kind, materialName) => { update({ ...project, materials: [...project.materials, { id: crypto.randomUUID(), name: materialName ?? `Material ${project.materials.length + 1}`, type: kind, stocks: [stock] }] }); closeMaterialForm(); }} /></div></div>
        {orderedMaterials.map((m, materialIndex) => <div className="material-card reorderable-row" key={m.id} {...dropProps('materials', m.id)} >
          {dragHandle('materials', m.id, m.name)}<div className="material-card-content"><div className="material-heading"><button type="button" className="collapse-toggle material-collapse-toggle" aria-label={`${collapsedMaterialIds.has(m.id) ? 'Expand' : 'Collapse'} material ${m.name}`} aria-expanded={!collapsedMaterialIds.has(m.id)} aria-controls={`material-content-${m.id}`} onClick={() => setCollapsedMaterialIds(current => { const next = new Set(current); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next; })}><CaretDown aria-hidden="true"/></button><label>Material<input id={`material-name-${m.id}`} aria-label="Material name" value={m.name} onChange={e => updateMaterial(m.id, x => ({ ...x, name: e.target.value }))}/></label><MaterialTypeToggle value={m.type} disabled={m.stocks.length > 0} groupLabel={`Material type for ${m.name}`} lockDescriptionId={`material-type-lock-${m.id}`} onChange={value => updateMaterial(m.id, x => ({ ...x, type: value }))}/>{quickActions('material', m.name, m.id, materialIndex, orderedMaterials.length, { move: direction => { moveItem('materials', m.id, direction); announceMove(m.name, direction); }, duplicate: () => { const id = crypto.randomUUID(); const copiedById = new Map(m.stocks.map(stock => [stock.id, { ...stock, id: crypto.randomUUID() }])); const copy = { ...m, id, name: `${m.name} copy`, stocks: m.stocks.map(stock => copiedById.get(stock.id)!) }; const stockOrder = orderedStocks(m).map(stock => copiedById.get(stock.id)!.id); const ids = insertEditorCopy(orderedMaterials.map(item => item.id), m.id, id); update({ ...project, materials: [...project.materials, copy], editorOrder: withEditorOrder(project.editorOrder, { materials: ids, stocks: { ...project.editorOrder?.stocks, [id]: stockOrder } }) }); setOrderAnnouncement(`${copy.name} duplicated.`); window.setTimeout(() => document.getElementById(`material-name-${id}`)?.focus(), 0); }, remove: () => { deletionTriggerId.current = `material-actions-${m.id}`; setPendingDeletion({ kind: 'material', id: m.id }); } })}</div>
          <div id={`material-content-${m.id}`} className={`collapsible-region ${collapsedMaterialIds.has(m.id) ? 'is-collapsed' : ''}`} aria-hidden={collapsedMaterialIds.has(m.id)} inert={collapsedMaterialIds.has(m.id)}><div className="collapsible-region-inner material-content-stack">
          {m.type === 'sheet' && <><p className="muted sheet-material-help">Choose a preset size or enter custom dimensions.</p><label>Sheet layout<Select aria-label="Sheet layout" value={project.sheetLayout ?? 'cheapest'} onValueChange={value => update({ ...project, sheetLayout: value as Project['sheetLayout'] })} options={[{ value: 'cheapest', label: 'Cheapest layout · simpler cuts break ties' }, { value: 'simplestCuts', label: 'Simplest cuts · strip-only' }]}/></label></>}{orderedStocks(m).map((s, stockIndex) => <div className="stock-editor reorderable-row" key={s.id} {...dropProps('stocks', s.id, m.id)} >
          {dragHandle('stocks', s.id, s.name, m.id)}<div className="stock-editor-content"><div className="stock-editor-head"><button type="button" className="collapse-toggle stock-collapse-toggle" aria-label={`${collapsedStockIds.has(s.id) ? 'Expand' : 'Collapse'} stock option ${s.name}`} aria-expanded={!collapsedStockIds.has(s.id)} aria-controls={`stock-content-${s.id}`} onClick={() => setCollapsedStockIds(current => { const next = new Set(current); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next; })}><CaretDown aria-hidden="true"/><span>Stock option</span>{collapsedStockIds.has(s.id) && <span className="stock-collapsed-name">· {s.name}</span>}</button>{quickActions('stock', s.name, s.id, stockIndex, orderedStocks(m).length, { move: direction => { moveItem('stocks', s.id, direction, m.id); announceMove(s.name, direction); }, duplicate: () => { const id = crypto.randomUUID(); const copy = { ...s, id, name: `${s.name} copy` }; const ids = insertEditorCopy(orderedStocks(m).map(item => item.id), s.id, id); update({ ...project, materials: project.materials.map(x => x.id === m.id ? { ...x, stocks: [...x.stocks, copy] } : x), editorOrder: withEditorOrder(project.editorOrder, { stocks: { ...project.editorOrder?.stocks, [m.id]: ids } }) }); setOrderAnnouncement(`${copy.name} duplicated.`); window.setTimeout(() => document.getElementById(`stock-name-${id}`)?.focus(), 0); }, remove: () => { deletionTriggerId.current = `stock-actions-${s.id}`; setPendingDeletion({ kind: 'stock', id: s.id }); } })}</div><div id={`stock-content-${s.id}`} className={`collapsible-region ${collapsedStockIds.has(s.id) ? 'is-collapsed' : ''}`} aria-hidden={collapsedStockIds.has(s.id)} inert={collapsedStockIds.has(s.id)}><div className="collapsible-region-inner"><div className="stock-fields"><label>Stock name<input id={`stock-name-${s.id}`} aria-label="Stock name" value={s.name} onChange={e => updateStock(m.id, s.id, x => ({ ...x, name: e.target.value }))}/></label><div className="number-field"><label htmlFor={`number-stepper-stock-length-${s.id}`}>{m.type === 'sheet' ? 'Sheet length' : 'Length'} ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper {...dimensionProps(`stock-length-${s.id}`, s.length.um, um => updateStock(m.id, s.id, x => ({ ...x, length: { um } })), 'Stock length')}/></div>{m.type === 'sheet' && <div className="number-field"><label htmlFor={`number-stepper-stock-width-${s.id}`}>Sheet width ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper {...dimensionProps(`stock-width-${s.id}`, s.widthUm ?? 0, um => updateStock(m.id, s.id, x => ({ ...x, widthUm: um })), 'Stock width')}/></div>}{m.type === 'linear' && <><div className="number-field"><label htmlFor={`number-stepper-stock-width-${s.id}`}>Board width ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper {...dimensionProps(`stock-width-${s.id}`, s.widthUm ?? 0, um => updateStock(m.id, s.id, x => ({ ...x, widthUm: um })), 'Stock width')}/></div><div className="number-field"><label htmlFor={`number-stepper-stock-thickness-${s.id}`}>Thickness ({project.unitSystem === 'imperial' ? 'in' : 'mm'})</label><NumberStepper {...dimensionProps(`stock-thickness-${s.id}`, s.thicknessUm ?? 0, um => updateStock(m.id, s.id, x => ({ ...x, thicknessUm: um })), 'Stock thickness')}/></div></>}<label>Price basis<Select aria-label="Stock price basis" value={s.priceBasis ?? 'piece'} onValueChange={value => updateStock(m.id, s.id, x => ({ ...x, priceBasis: value as StockOption['priceBasis'] }))} disabled={m.type === 'sheet'} options={[{ value: 'board-foot', label: 'Per board foot' }, { value: 'piece', label: 'Per stock piece' }]}/></label><div className="number-field"><label htmlFor={`number-stepper-stock-price-${s.id}`}>Manual price ($) · enter unless owned</label><NumberStepper id={`number-stepper-stock-price-${s.id}`} aria-label="Stock price" aria-required="true" placeholder="Required for purchase" type="number" min="0" step="0.01" value={s.price ? (s.price.cents / 100).toFixed(2) : ''} onChange={e => updateStock(m.id, s.id, x => ({ ...x, price: e.target.value === '' ? undefined : { cents: Math.max(0, Math.round(Number(e.target.value) * 100)) } }))} onStep={steps => updateStock(m.id, s.id, x => ({ ...x, price: { cents: Math.max(0, (x.price?.cents ?? 0) + steps) } }))}/></div><div className="number-field"><label htmlFor={`number-stepper-owned-${s.id}`}>Owned quantity</label><NumberStepper id={`number-stepper-owned-${s.id}`} aria-label="Owned stock quantity" type="number" min="0" value={s.ownedQuantity} onChange={e => updateStock(m.id, s.id, x => ({ ...x, ownedQuantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} onStep={steps => updateStock(m.id, s.id, x => ({ ...x, ownedQuantity: Math.max(0, x.ownedQuantity + steps) }))}/></div><div className="number-field"><label htmlFor={`number-stepper-limit-${s.id}`}>Purchase limit</label><NumberStepper id={`number-stepper-limit-${s.id}`} aria-label="Stock purchase limit" type="number" min="0" value={s.quantityLimit ?? ''} placeholder="No limit" onChange={e => updateStock(m.id, s.id, x => ({ ...x, quantityLimit: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} onStep={steps => updateStock(m.id, s.id, x => ({ ...x, quantityLimit: Math.max(0, (x.quantityLimit ?? 0) + steps) }))}/></div></div>{(!s.price || s.price.cents === 0) && <small className="field-help">No purchase price entered. This stock can be planned only from owned quantity until a positive manual price is entered.</small>}</div></div></div></div>)}<button id={`add-stock-${m.id}`} className="secondary compact add-stock-option" onClick={() => setStockFormMaterialId(current => current === m.id ? null : m.id)}>＋ Add stock option</button>{stockFormMaterialId === m.id && <StockCreationForm mode="stock" unitSystem={project.unitSystem} fixedKind={m.type} onCancel={() => setStockFormMaterialId(null)} onCreate={stock => { updateMaterial(m.id, x => ({ ...x, stocks: [...x.stocks, stock] })); setStockFormMaterialId(null); }}/>}
        </div></div></div></div>)}{!project.materials.length && <p className="muted">Prices are entered and maintained by you. No store lookup is used.</p>}
      </section>
    </section>
    <CutPlan project={project} mixedResult={mixedResult} expanded={planExpanded} onExpandedChange={setPlanExpanded} /></div>
  </>;
}
