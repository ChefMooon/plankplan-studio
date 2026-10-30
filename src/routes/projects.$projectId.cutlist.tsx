/* TanStack file routes export a Route object alongside their page component. */
/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { exportProject, importProject, parseFractionalInches, restoreProjectDocument, umFromInches, umFromMillimeters, type Material, type Project, type StockOption } from '@/lib/planner/model';
import { partKind } from '@/lib/planner/part-stock';
import { optimizeMixedProject } from '@/lib/planner/combined';
import { exportCutCsv } from '@/lib/planner/exports';
import { projectRepository } from '@/lib/planner/repository.indexeddb';
import type { ConcurrencyToken } from '@/lib/planner/repository';
import { PageSkeleton, useProjectShell } from '@/components/ProjectWorkspaceShell';
import { ProjectInfoDialog, type ProjectInfoDraft } from '@/components/ProjectInfoDialog';
import { dropEditorItem, getEditorDropIntent, type EditorDropIntent, moveEditorItem, removeEditorId, resolveEditorOrder, withEditorOrder } from '@/lib/planner/editor-order';
import { CutPlan } from '@/components/cutlist/CutPlan';
import { QuickActions, type QuickActionCallbacks } from '@/components/cutlist/QuickActions';
import { PartsEditor } from '@/components/cutlist/PartsEditor';
import { MaterialsStockEditor } from '@/components/cutlist/MaterialsStockEditor';
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
  const quickActions = (kind: 'part' | 'material' | 'stock', label: string, id: string, position: number, count: number, actions: QuickActionCallbacks) => <QuickActions kind={kind} label={label} id={id} position={position} count={count} actions={actions}/>;
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
      <PartsEditor project={project} update={update} dimensionProps={dimensionProps} dropProps={dropProps} dragHandle={dragHandle} quickActions={quickActions} moveItem={moveItem} announceMove={announceMove} setOrderAnnouncement={setOrderAnnouncement} deletionTriggerId={deletionTriggerId} setPendingDeletion={setPendingDeletion} projectSettingsExpanded={projectSettingsExpanded} toggleProjectSettings={toggleProjectSettings} newPartMaterialId={newPartMaterialId} setNewPartMaterialId={setNewPartMaterialId} stockOptions={stockOptions} addPart={addPart} settingsTab={settingsTab} setSettingsTab={setSettingsTab} setDimensionDrafts={setDimensionDrafts} orderedParts={orderedParts} orderAnnouncement={orderAnnouncement} />
      <MaterialsStockEditor project={project} update={update} dimensionProps={dimensionProps} dropProps={dropProps} dragHandle={dragHandle} quickActions={quickActions} moveItem={moveItem} announceMove={announceMove} setOrderAnnouncement={setOrderAnnouncement} deletionTriggerId={deletionTriggerId} setPendingDeletion={setPendingDeletion} materialFormOpen={materialFormOpen} setMaterialFormOpen={setMaterialFormOpen} closeMaterialForm={closeMaterialForm} orderedMaterials={orderedMaterials} orderedStocks={orderedStocks} collapsedMaterialIds={collapsedMaterialIds} setCollapsedMaterialIds={setCollapsedMaterialIds} collapsedStockIds={collapsedStockIds} setCollapsedStockIds={setCollapsedStockIds} stockFormMaterialId={stockFormMaterialId} setStockFormMaterialId={setStockFormMaterialId} updateMaterial={updateMaterial} updateStock={updateStock} />
    </section>
    <CutPlan project={project} mixedResult={mixedResult} expanded={planExpanded} onExpandedChange={setPlanExpanded} /></div>
  </>;
}
