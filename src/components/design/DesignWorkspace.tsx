import { Suspense, lazy, useMemo, useState, useEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '@/lib/planner/model';
import { inchesFromUm, millimetersFromUm, umFromInches, umFromMillimeters } from '@/lib/planner/model';
import { readDesignViewPreferences, writeDesignViewPreferences, type DesignViewPreferences } from '@/lib/planner/design/view-preferences';
import { getRectangularProfile, resizeRectangularProfile, scaleDimensionUm } from '@/lib/planner/design/geometry';
import { createApplyIntent, createProjectionPreview, isProjectionPreviewCurrent, type ProjectionPreview, type ProjectionRow, type RowDecision } from '@/lib/planner/design/projection';
import { newDesignDocument, type DesignCommand } from '@/lib/planner/design/commands';
import { createDesignHistory, commitSessionCommand, undoSession, redoSession, type DesignHistory } from '@/lib/planner/design/history';
import { ContextMenu as RadixContextMenu } from 'radix-ui';
import { keepGeometryCenter, geometryCenter, rotateAroundWorkspaceAxis, localizeDelta, type AxisMode, type PivotMode } from './transform-pivot';
import type { SubElement } from './sub-selection';
import type { ToolMeasurementSession } from './tool-measurements';
import { ToolMeasurementBox } from './ToolMeasurementBox';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { DesignToolIcon, type DesignToolIconName } from './DesignToolIcon';
import { DesignPanelIcon, type DesignPanelIconName } from './DesignPanelIcon';
import { ProjectInfoDialog, type ProjectInfoDraft } from '@/components/ProjectInfoDialog';
const Viewport = lazy(() => import('./DesignViewport').then(module => ({ default: module.DesignViewport })));

const tools = [
  { id: 'select', label: 'Select', icon: 'select', key: 'Space' }, { id: 'line', label: 'Line', icon: 'line', key: 'l' }, { id: 'rectangle', label: 'Rectangle', icon: 'rectangle', key: 'r' },
  { id: 'push-pull', label: 'Push / Pull', icon: 'push-pull', key: 'p' }, { id: 'erase', label: 'Eraser', icon: 'erase', key: 'e' },
  { id: 'move', label: 'Move', icon: 'move', key: 'm' }, { id: 'rotate', label: 'Rotate', icon: 'rotate', key: 'q' },
  { id: 'scale', label: 'Scale', icon: 'scale', key: 's' }, { id: 'paint', label: 'Paint', icon: 'paint', key: 'b' },
  { id: 'orbit', label: 'Orbit', icon: 'orbit', key: 'o' }, { id: 'pan', label: 'Pan', icon: 'pan', key: 'h' },
  { id: 'measure', label: 'Tape Measure', icon: 'measure', key: 't' },
] satisfies Array<{ id: string; label: string; icon: DesignToolIconName; key: string }>;
const drawers = ['Entity Info', 'Materials', 'Components', 'Display', 'Model Info'] as const;
const drawerIcons: Record<(typeof drawers)[number], DesignPanelIconName> = { 'Entity Info': 'entity', Materials: 'materials', Components: 'components', Display: 'display', 'Model Info': 'model' };
const drawerTooltips: Record<(typeof drawers)[number], string> = { 'Entity Info': 'Entity Info · inspect and edit the current selection', Materials: 'Materials · assign cutlist material and paint', Components: 'Components · find and add model items', Display: 'Display · change grid, axes, and snapping', 'Model Info': 'Model Info · review model counts, history, and cutlist links' };
const keyLabel=(key:string)=>key==='Space'?'Space':key.toUpperCase();
const formatProjectLength=(project:Project,um:number)=>project.unitSystem==='imperial'?`${inchesFromUm(um).toFixed(3)} in`:`${millimetersFromUm(um).toFixed(1)} mm`;

function previewStockFit(project: Project, row: ProjectionRow): { message: string; unverified: boolean } {
  const material = project.materials.find(item => item.id === row.fields.materialId);
  if (!material) return { message: 'Missing material; this row cannot be optimized.', unverified: false };
  if (!material.stocks.length) return { message: `No stock options for ${material.name}.`, unverified: false };
  if (material.type === 'linear') {
    const matchingLength = material.stocks.filter(stock => stock.length.um >= row.fields.length.um + project.trim.um);
    const verified = matchingLength.some(stock => stock.widthUm !== undefined && stock.thicknessUm !== undefined && row.fields.crossSection !== undefined && ((row.fields.crossSection.width.um <= stock.widthUm && row.fields.crossSection.thickness.um <= stock.thicknessUm) || (row.fields.crossSection.thickness.um <= stock.widthUm && row.fields.crossSection.width.um <= stock.thicknessUm)));
    if (verified) return { message: `Cross-section fits at least one actual-size option in ${material.name}; 90° turn is allowed.`, unverified: false };
    if (matchingLength.some(stock => stock.widthUm === undefined || stock.thicknessUm === undefined)) return { message: 'Stock length is sufficient, but actual cross-section dimensions are missing; fit is unverified.', unverified: true };
    return { message: `No ${material.name} stock option has a verified length and cross-section fit.`, unverified: false };
  }
  const lengthFits = material.stocks.some(stock => {
    if (stock.widthUm === undefined || row.fields.width === undefined) return false;
    const direct = stock.length.um >= row.fields.length.um + project.trim.um && stock.widthUm >= row.fields.width.um;
    const turned = !row.fields.grainLocked && stock.length.um >= row.fields.width.um + project.trim.um && stock.widthUm >= row.fields.length.um;
    return direct || turned;
  });
  const missingWidth = material.stocks.some(stock => stock.widthUm === undefined);
  const thicknessText = `Panel thickness (${formatProjectLength(project,row.designThicknessUm)}) compatibility is unverified by 2D sheet planning.`;
  if (!lengthFits && missingWidth) return { message: `Sheet fit dimensions are incomplete. ${thicknessText}`, unverified: true };
  if (!lengthFits) return { message: `No ${material.name} stock option has a verified 2D length/width fit. ${thicknessText}`, unverified: true };
  return { message: `2D length/width fit is possible. ${thicknessText}`, unverified: true };
}

export function DesignWorkspace({ project, onCommit, localGeneration = 0, saveStatus = 'Saved locally' }: { project: Project; onCommit?: (project: Project) => void | Promise<boolean>; localGeneration?: number; saveStatus?: string }) {
  const [working, setWorking] = useState(project);
  const [history, setHistory] = useState<DesignHistory>(() => createDesignHistory());
  const [activeTool, setActiveTool] = useState('select');
  const [numeric, setNumeric] = useState('');
  const [shapeEditOpen,setShapeEditOpen]=useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [context, setContext] = useState<{x:number;y:number}|undefined>();
  const [measurement,setMeasurement]=useState<number>();
  const [toolMeasurement,setToolMeasurement]=useState<ToolMeasurementSession>();
  const measurementActions=useRef<{commit:()=>void;cancel:()=>void}|undefined>(undefined);
  const [helpOpen,setHelpOpen]=useState(false);
  const [projectInfoOpen,setProjectInfoOpen]=useState(false);
  const [projectInfoDraft,setProjectInfoDraft]=useState<ProjectInfoDraft>({name:project.name,notes:project.notes??'',unitSystem:project.unitSystem});
  const [projectInfoError,setProjectInfoError]=useState('');
  const [projectInfoSaving,setProjectInfoSaving]=useState(false);
  const [helpQuery,setHelpQuery]=useState('');
  const [viewportBounds,setViewportBounds]=useState<HTMLElement|null>(null);
  const [editingDefinitionId,setEditingDefinitionId]=useState<string>();
  const [renameFocusRequested,setRenameFocusRequested]=useState(false);
  const [pivotMode,setPivotMode]=useState<PivotMode>('origin');
  const [axisMode,setAxisMode]=useState<AxisMode>('world');
  const [selectionIds,setSelectionIds]=useState<string[]>([]);
  const [selectedElement,setSelectedElement]=useState<({objectId:string}&SubElement)>();
  const contextAnchor=useRef<HTMLElement|null>(null);
  const renameInputRef=useRef<HTMLInputElement|null>(null);
  const workspaceRef=useRef<HTMLElement|null>(null);
  const helpReturnFocus=useRef<HTMLElement|null>(null);
  const drawerReturnFocus=useRef<HTMLElement|null>(null);
  const wasHelpOpen=useRef(false);
  const newId = () => globalThis.crypto?.randomUUID?.() ?? `design-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lengthUnit=working.unitSystem==='imperial'?'in':'mm';
  const lengthFromInput=(value:string)=>working.unitSystem==='imperial'?umFromInches(Number(value)):umFromMillimeters(Number(value));
  const formatLength=(um:number)=>formatProjectLength(working,um);
  const run = (command: DesignCommand) => {
    if (projectionBusy) return;
    const base = { ...working, updatedAt: new Date().toISOString(), ...(working.design ? {} : { design: newDesignDocument() }) };
    const result = commitSessionCommand(history, base, command);
    if (!result.result.ok) { setNotice(`Could not apply: ${result.result.message}`); return; }
    setHistory(result.history); setWorking(result.project); setEditSequence(value=>value+1); onCommit?.(result.project); setNotice(`${result.result.label} · unsaved changes`);
  };
  const undo = () => { if(projectionBusy)return; const result = undoSession(history, working); setHistory(result.history); setWorking(result.project); setEditSequence(value=>value+1); onCommit?.(result.project); setNotice('Undo'); };
  const redo = () => { if(projectionBusy)return; const result = redoSession(history, working); setHistory(result.history); setWorking(result.project); setEditSequence(value=>value+1); onCommit?.(result.project); setNotice('Redo'); };
  const [view, setView] = useState<DesignViewPreferences>(() => readDesignViewPreferences(project.id));
  const [selectedId, setSelectedId] = useState<string>();
  const [frameRequest, setFrameRequest] = useState(0);
  const [drawer, setDrawer] = useState<(typeof drawers)[number]>('Entity Info');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projectionPreview, setProjectionPreview] = useState<ProjectionPreview>();
  const [projectionDecisions, setProjectionDecisions] = useState<Record<string, RowDecision>>({});
  const [projectionBusy, setProjectionBusy] = useState(false);
  const [editSequence, setEditSequence] = useState(0);
  const selection = useMemo(() => {
    const d = working.design;
    if (!d || !selectedId) return undefined;
    const instance = d.instances.find(x => x.id === selectedId);
    if (instance) { const cutSpec = d.definitions.find(x => x.id === instance.definitionId)?.cutSpec; const dimensions = cutSpec ? { ...cutSpec, lengthUm: scaleDimensionUm(cutSpec.lengthUm, instance.scalePpm[0]), widthUm: scaleDimensionUm(cutSpec.widthUm, instance.scalePpm[1]), thicknessUm: scaleDimensionUm(cutSpec.thicknessUm, instance.scalePpm[2]) } : undefined; return { id: instance.id, name: instance.name ?? d.definitions.find(x => x.id === instance.definitionId)?.name ?? 'Component', type: 'Component', state: instance.hidden ? 'Hidden' : instance.locked ? 'Locked' : cutSpec?.confirmation === 'requires-confirmation' ? 'Needs dimension confirmation' : 'Visible', dimensions }; }
    const loose = d.looseObjects.find(x => x.id === selectedId);
    if (loose) return { id: loose.id, name: loose.name, type: 'Loose geometry', state: loose.locked ? 'Locked' : loose.hidden ? 'Hidden' : 'Visible', dimensions: undefined };
    const definition = d.definitions.find(x => x.id === selectedId);
    return definition ? { id: definition.id, name: definition.name, type: 'Definition', state: definition.cutSpec?.confirmation === 'requires-confirmation' ? 'Needs dimension confirmation' : 'Shared definition', dimensions: definition.cutSpec } : undefined;
  }, [working.design, selectedId]);
  const openProjectInfo=()=>{measurementActions.current?.cancel();setToolMeasurement(undefined);setMeasurement(undefined);setNumeric('');setProjectInfoDraft({name:working.name,notes:working.notes??'',unitSystem:working.unitSystem});setProjectInfoError('');setProjectInfoOpen(true);};
  const saveProjectInfo=async()=>{
    const name=projectInfoDraft.name.trim();
    if(!name){setProjectInfoError('Enter a project name.');return;}
    if(name.length>256){setProjectInfoError('Project names must be 256 characters or fewer.');return;}
    if(projectInfoDraft.notes.length>16384){setProjectInfoError('Notes must be 16,384 characters or fewer.');return;}
    if(saveStatus.startsWith('Conflict')){setProjectInfoError('Reload this project before saving changes.');return;}
    const next={...working,name,notes:projectInfoDraft.notes||undefined,unitSystem:projectInfoDraft.unitSystem,updatedAt:new Date().toISOString()};
    setProjectInfoSaving(true);
    try {
      const saved=onCommit ? await onCommit(next) : true;
      if(!saved){setProjectInfoError('Project information was not saved. Resolve the save issue and try again.');return;}
      setWorking(next);
      setHistory(old=>({...old,entries:old.entries.map(entry=>({ ...entry,before:{...entry.before,name,notes:next.notes,unitSystem:next.unitSystem},after:{...entry.after,name,notes:next.notes,unitSystem:next.unitSystem}}))}));
      if(projectInfoDraft.unitSystem!==working.unitSystem){measurementActions.current?.cancel();setToolMeasurement(undefined);setMeasurement(undefined);setNumeric('');setProjectionPreview(undefined);setProjectionDecisions({});setEditSequence(value=>value+1);}
      setProjectInfoOpen(false);
      setNotice('Project information saved.');
    } catch { setProjectInfoError('Project information could not be saved. Try again.'); }
    finally {setProjectInfoSaving(false);}
  };
  const selectedInstance=working.design?.instances.find(item=>item.id===selectedId);
  const selectedLoose=working.design?.looseObjects.find(item=>item.id===selectedId);
  const selectedDefinition=working.design?.definitions.find(item=>item.id===selectedId);
  const updateView = (patch: Partial<DesignViewPreferences>) => setView(old => {
    const next = { ...old, ...patch };
    writeDesignViewPreferences(project.id, next);
    return next;
  });
  const objects = [
    ...(working.design?.instances.map(i => ({ id: i.id, name: i.name || working.design?.definitions.find(d => d.id === i.definitionId)?.name || 'Component', type: 'Component' })) ?? []),
    ...(working.design?.looseObjects.map(i => ({ id: i.id, name: i.name, type: 'Loose geometry' })) ?? []),
    ...(working.design?.definitions.filter(d => !working.design?.instances.some(i => i.definitionId === d.id)).map(d => ({ id: d.id, name: d.name, type: 'Definition' })) ?? []),
  ];

  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (!!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'));
    const keydown = (event: KeyboardEvent) => {
      if (!workspaceRef.current?.contains(document.activeElement) || !(event.target instanceof Node && workspaceRef.current.contains(event.target))) return;
      if (event.key === 'Escape' && drawerOpen) { event.preventDefault(); setDrawerOpen(false); (drawerReturnFocus.current ?? document.getElementById(`design-tab-${drawer.replaceAll(' ', '-')}`))?.focus(); return; }
      if (event.target instanceof Element && event.target.closest('.design-info-rail')) return;
      if (editable(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd' && selectedId) { event.preventDefault(); const item=working.design?.instances.find(x=>x.id===selectedId); if(item)run({type:'duplicate-instance',sourceId:item.id,id:newId()}); return; }
      const shortcut = event.code === 'Space' ? 'Space' : event.key.toLowerCase();
      const tool = tools.find(item => item.key.toLowerCase() === shortcut.toLowerCase());
      if (tool && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault();measurementActions.current?.cancel(); setActiveTool(tool.id); setToolMeasurement(undefined); setMeasurement(undefined); setNumeric(''); setContext(undefined); setNotice(tool.id==='rectangle'?'Rectangle tool · click the first corner, move to preview, then click the second corner':tool.id==='line'?(selectionIds.length>1?'Line tool · joining multiple selected profiles is unsupported': 'Line tool · click an endpoint on the selected profile to append; otherwise starts a separate segment'):`${tool.label} tool · ${keyLabel(tool.key)}`); }
      if (event.key.toLowerCase()==='g'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&selectedId){const loose=working.design?.looseObjects.find(x=>x.id===selectedId);if(loose){event.preventDefault();run({type:'make-component',objectId:loose.id,definitionId:newId(),instanceId:newId(),name:loose.name});}}
      if (event.key === 'Escape') { measurementActions.current?.cancel(); setToolMeasurement(undefined); setContext(undefined); setHelpOpen(false); setNumeric(''); setMeasurement(undefined); setActiveTool('select'); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { const d=working.design; if(d?.instances.some(x=>x.id===selectedId))run({type:'delete-instance',instanceId:selectedId}); else if(d?.looseObjects.some(x=>x.id===selectedId))run({type:'delete-loose',objectId:selectedId}); }
      if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); setContext({x:window.innerWidth/2,y:window.innerHeight/2}); }
      if (event.key === 'ContextMenu' || event.key === 'Apps') { event.preventDefault();setContext({x:window.innerWidth/2,y:window.innerHeight/2}); }
      if (event.key === '?' || event.key === '/') { if(event.shiftKey||event.key==='?'){event.preventDefault();helpReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setHelpOpen(true);} }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(()=>{if(helpOpen){wasHelpOpen.current=true;return;}if(wasHelpOpen.current){wasHelpOpen.current=false;helpReturnFocus.current?.focus();helpReturnFocus.current=null;}},[helpOpen]);
  useEffect(()=>{if(!renameFocusRequested||!selection)return;const timer=window.setTimeout(()=>{renameInputRef.current?.focus();renameInputRef.current?.select();setRenameFocusRequested(false);},0);return()=>window.clearTimeout(timer);},[renameFocusRequested,selection]);
  useEffect(()=>{const blur=()=>{measurementActions.current?.cancel();setToolMeasurement(undefined);setActiveTool('select');setNumeric('');setMeasurement(undefined);setContext(undefined);};window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);

  const createBoard = () => {
    const val = Number(numeric);
    const defaults = working.materials.find(material => material.type === 'linear');
    const stock = defaults?.stocks[0];
    const enteredLength=Number.isFinite(val)&&val>0?lengthFromInput(numeric):undefined;
    const lengthUm = enteredLength && Number.isSafeInteger(enteredLength) ? enteredLength : stock?.length.um ?? 2_438_400;
    run({type:'create-board',id:newId(),definitionId:newId(),name:'Board',materialId:defaults?.id,lengthUm,widthUm:stock?.widthUm ?? 88_900,thicknessUm:stock?.thicknessUm ?? 38_100});
  };
  const reviewCutlist = () => {
    if (saveStatus.startsWith('Conflict')) { setNotice('Reload this project before creating a current cutlist review.'); return; }
    if (saveStatus.startsWith('Saving')) { setNotice('Wait for the current project save before creating a cutlist review.'); return; }
    if (!working.design) { setNotice('There is no model to review.'); return; }
    const preview = createProjectionPreview(working, editSequence, localGeneration, () => newId());
    setProjectionPreview(preview); setProjectionDecisions({}); setDrawer('Model Info'); setDrawerOpen(true);
    setNotice(preview.changes.length ? `${preview.changes.length} cutlist change${preview.changes.length === 1 ? '' : 's'} ready for review` : 'No cutlist changes to review');
  };
  const applyReviewedCutlist = async () => {
    if (saveStatus.startsWith('Conflict')) { setNotice('Reload this project before applying a cutlist review.'); return; }
    if (saveStatus.startsWith('Saving')) { setNotice('Wait for the current project save before applying this cutlist review.'); return; }
    const preview = projectionPreview;
    if (!preview) return;
    if (!isProjectionPreviewCurrent(preview, editSequence, localGeneration)) { setNotice('Preview is stale. Review the current model again before applying.'); return; }
    try {
      const intent = createApplyIntent(working, preview, projectionDecisions, { editSequence, localGeneration });
      const next = { ...working, parts: intent.parts, design: intent.design, updatedAt: new Date().toISOString() };
      setProjectionBusy(true);
      const outcome = onCommit?.(next);
      const saved = outcome instanceof Promise ? await outcome : true;
      if (!saved) { setNotice('Cutlist changes were not saved. Your current model and saved project remain available; retry after resolving the save issue.'); return; }
      setWorking(next); setProjectionPreview(undefined); setProjectionDecisions({}); setHistory(createDesignHistory()); setEditSequence(value=>value+1);
      setNotice('Reviewed cutlist changes saved with their design links.');
    } catch (error) { setNotice(error instanceof Error ? `Could not apply review: ${error.message}` : 'Could not apply review.'); }
    finally { setProjectionBusy(false); }
  };
  const changeProjectionDisposition = (rowKey: string, disposition: NonNullable<RowDecision['disposition']>) => setProjectionDecisions(old => ({ ...old, [rowKey]: { ...old[rowKey], disposition } }));
  const changeProjectionField = (rowKey: string, field: string, choice: 'manual' | 'design') => setProjectionDecisions(old => ({ ...old, [rowKey]: { ...old[rowKey], fieldChoices: { ...old[rowKey]?.fieldChoices, [field]: choice } } }));
  const applyExact = () => {
    const raw=Number(numeric);if(!Number.isFinite(raw)||raw===0)return;
    const n=['rotate','scale'].includes(activeTool)?raw:lengthFromInput(numeric);if(!Number.isSafeInteger(n)||n===0)return;
    const instance=working.design?.instances.find(x=>x.id===selectedId);const loose=working.design?.looseObjects.find(x=>x.id===selectedId);const target=instance??loose;const def=working.design?.definitions.find(x=>x.id===instance?.definitionId);
    if(activeTool==='rotate'&&target&&!target.locked){const pose={...target.pose,rotation:rotateAroundWorkspaceAxis(target.pose.rotation,n*Math.PI/180,toolMeasurement?.rotationAxis??'z')};const geometry=loose?.geometry??def?.geometry;const nextPose=geometry?keepGeometryCenter(geometryCenter(geometry),target.pose,target.scalePpm,pose,target.scalePpm,pivotMode):pose;run(instance?{type:'set-instance-transform',instanceId:instance.id,pose:nextPose}:{type:'set-loose-transform',objectId:target.id,pose:nextPose});}
    else if(activeTool==='scale'&&target&&!target.locked&&n>0){const scalePpm:[number,number,number]=[n,n,n];const geometry=loose?.geometry??def?.geometry;const nextPose=geometry?keepGeometryCenter(geometryCenter(geometry),target.pose,target.scalePpm,target.pose,scalePpm,pivotMode):target.pose;run(instance?{type:'set-instance-transform',instanceId:instance.id,scalePpm,pose:nextPose,reason:'instance-scaled'}:{type:'set-loose-transform',objectId:target.id,pose:nextPose,scalePpm});}
    else if(activeTool==='move'&&target&&!target.locked){const [dx,dy,dz]=axisMode==='local'?localizeDelta([n,0,0],target.pose,'local'):[n,0,0];const positionUm=target.pose.positionUm.map((value,index)=>value+[dx,dy,dz][index]) as [number,number,number];const pose={...target.pose,positionUm};run(instance?{type:'set-instance-transform',instanceId:instance.id,pose}:{type:'set-loose-transform',objectId:target.id,pose});}
    else if(instance&&def?.cutSpec&&n>0){run({type:'set-primitive-dimensions',definitionId:def.id,lengthUm:n,widthUm:def.cutSpec.widthUm,thicknessUm:def.cutSpec.thicknessUm});}
    setNumeric('');
  };
  const applyShapeDimensions=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const toUm=(name:string)=>{const value=Number(form.get(name));return working.unitSystem==='imperial'?umFromInches(value):umFromMillimeters(value);};const lengthUm=toUm('shape-length'),widthUm=toUm('shape-width'),depthRaw=form.get('shape-depth'),depthUm=depthRaw===null?undefined:toUm('shape-depth');if(![lengthUm,widthUm,...(depthUm===undefined?[]:[depthUm])].every(value=>Number.isSafeInteger(value)&&value>0&&value<=1_000_000_000)){setNotice(`Enter positive dimensions in ${lengthUnit} within the model limit`);return;}if(selectedInstance){const definition=working.design?.definitions.find(item=>item.id===selectedInstance.definitionId);if(!definition?.cutSpec||definition.cutSpec.kind==='explicit'||selectedInstance.locked)return;run({type:'set-primitive-dimensions',definitionId:definition.id,lengthUm,widthUm,thicknessUm:depthUm??definition.cutSpec.thicknessUm});}else if(selectedLoose&&!selectedLoose.locked){try{run({type:'set-loose-geometry',objectId:selectedLoose.id,geometry:resizeRectangularProfile(selectedLoose.geometry,{lengthUm,widthUm,...(depthUm===undefined?{}:{depthUm})},undefined,`edit-${newId()}`)});}catch(error){setNotice(error instanceof Error?error.message:'Could not resize rectangle');return;}}setShapeEditOpen(false);};

  return <section ref={workspaceRef} className="design-workspace" aria-label="Design workspace" tabIndex={-1}>
    <section className="design-canvas-panel" aria-label="Model view">
      <div className="design-view-controls" aria-label="Camera controls">
        {([['iso','Isometric'],['top','Top'],['front','Front'],['right','Right']] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={view.preset === id} onClick={() => updateView({ preset: id })}>{label}</button>)}
        <span className="design-control-separator" />
        <button type="button" aria-pressed={view.projection === 'perspective'} onClick={() => updateView({ projection: 'perspective' })}>Perspective</button><button type="button" aria-pressed={view.projection === 'orthographic'} onClick={() => updateView({ projection: 'orthographic' })}>Orthographic</button>
        <button type="button" onClick={() => { setSelectedId(undefined); updateView({ preset: 'iso' }); setFrameRequest(value => value + 1); }}>Frame model</button>
        <button type="button" disabled={!selection} onClick={() => setFrameRequest(value => value + 1)}>Frame selection</button>
      </div>
      <RadixContextMenu.Root open={!!context} onOpenChange={open=>{if(open){measurementActions.current?.cancel();setToolMeasurement(undefined);setMeasurement(undefined);setActiveTool('select');setNotice('Unfinished gesture cancelled');setContext(c=>c??{x:window.innerWidth/2,y:window.innerHeight/2});}else setContext(undefined);}}><RadixContextMenu.Trigger asChild><div className="design-viewport" tabIndex={0} ref={element=>{contextAnchor.current=element;setViewportBounds(element);}} onContextMenu={() => { measurementActions.current?.cancel();setToolMeasurement(undefined);setMeasurement(undefined);contextAnchor.current?.focus();setActiveTool('select');setNotice('Gesture cancelled · contextual menu'); }} onPointerDown={event => { contextAnchor.current?.focus();if(event.button===2) { measurementActions.current?.cancel();setToolMeasurement(undefined);setMeasurement(undefined);if(activeTool!=='select') { setActiveTool('select'); setNotice('Gesture cancelled · contextual menu'); } } }}>
        <aside className="design-tool-rail pp-scrollbar" aria-label="Design tools">{tools.map(tool => <Tooltip key={tool.id} content={`${tool.label} · ${keyLabel(tool.key)}`}><button type="button" className={`design-tool ${activeTool === tool.id ? 'is-active' : ''}`} aria-label={`${tool.label} (${keyLabel(tool.key)})`} aria-pressed={activeTool === tool.id} onPointerDown={event=>event.stopPropagation()} onClick={() => { measurementActions.current?.cancel(); setActiveTool(tool.id); setToolMeasurement(undefined); setMeasurement(undefined);setNumeric('');setContext(undefined);setNotice(tool.id==='rectangle'?'Rectangle tool · click the first corner, move to preview, then click the second corner':tool.id==='line'?(selectionIds.length>1?'Line tool · joining multiple selected profiles is unsupported': 'Line tool · click an endpoint on the selected profile to append; otherwise starts a separate segment'):`${tool.label} tool · ${keyLabel(tool.key)}`); }}><DesignToolIcon name={tool.icon} /></button></Tooltip>)}<Tooltip content="Create board"><button type="button" className="design-tool" aria-label="Create board" onPointerDown={event=>event.stopPropagation()} onClick={createBoard}>＋</button></Tooltip><Tooltip content="Keyboard shortcuts"><button type="button" className="design-tool" aria-label="Keyboard shortcuts" onPointerDown={event=>event.stopPropagation()} onClick={event=>{helpReturnFocus.current=event.currentTarget;setHelpOpen(true)}}>?</button></Tooltip></aside>
        <Suspense fallback={<div className="design-loading" role="status">Loading 3D view…</div>}><Viewport projectId={project.id} design={working.design} unitSystem={working.unitSystem} selectedId={selectedId} selectedCount={selectionIds.length} selectedElement={selectedElement} editingDefinitionId={editingDefinitionId} editingObjectId={shapeEditOpen?selectedId:undefined} onSelect={(id,add,subtract,shiftOnly)=>{setSelectedElement(undefined);if(!id){if(!add&&!subtract){setSelectedId(undefined);setSelectionIds([]);}return;}setSelectedId(id);setSelectionIds(old=>subtract||(shiftOnly&&old.includes(id))?old.filter(x=>x!==id):add?old.includes(id)?old:[...old,id]:[id]);}} onSubSelect={(objectId,element)=>setSelectedElement(element?{objectId,...element}:undefined)} onEnterDefinition={id=>{setShapeEditOpen(false);const loose=working.design?.looseObjects.find(item=>item.id===id);if(loose){setSelectedId(loose.id);setSelectionIds([loose.id]);if(getRectangularProfile(loose.geometry))setShapeEditOpen(true);return;}setEditingDefinitionId(id);const instance=working.design?.instances.find(item=>item.definitionId===id);const cutSpec=working.design?.definitions.find(item=>item.id===id)?.cutSpec;if(instance&&cutSpec?.kind!=='explicit'){setSelectedId(instance.id);setSelectionIds([instance.id]);setShapeEditOpen(true);}setNotice(`Editing shared definition · edits affect ${working.design?.instances.filter(item=>item.definitionId===id).length??0} linked instances`);}} activeTool={activeTool} toolMeasurement={toolMeasurement} onToolMeasurementChange={setToolMeasurement} onRegisterMeasurementActions={actions=>{measurementActions.current=actions;}} snap={view.snap} exactUm={Number.isFinite(Number(numeric))&&Number(numeric)!==0&&(['push-pull','move'].includes(activeTool)||Number(numeric)>0)?lengthFromInput(numeric):undefined} pivotMode={pivotMode} axisMode={axisMode} onCommand={run} onMeasure={setMeasurement} onToolError={setNotice} preset={view.preset} projection={view.projection} grid={view.grid} axes={view.axes} frameRequest={frameRequest} /></Suspense>
    <aside className={`design-info-rail${drawerOpen ? ' is-open' : ''}`} aria-label="Design information" onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>event.stopPropagation()}>
      <div className="design-drawer-tabs" role="tablist" aria-label="Workspace panels" aria-orientation="vertical" onKeyDown={event => {
        const current = drawers.indexOf(drawer);
        const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (current + 1) % drawers.length : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (current + drawers.length - 1) % drawers.length : event.key === 'Home' ? 0 : event.key === 'End' ? drawers.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); setDrawer(drawers[next]); setDrawerOpen(true); const nextTab=document.getElementById(`design-tab-${drawers[next].replaceAll(' ', '-')}`); if(nextTab instanceof HTMLElement){drawerReturnFocus.current=nextTab;nextTab.focus();} }
      }}>{drawers.map(name => <Tooltip key={name} content={drawerTooltips[name]} side="left"><button id={`design-tab-${name.replaceAll(' ', '-')}`} role="tab" type="button" aria-label={name} aria-selected={drawer === name} aria-expanded={drawer === name && drawerOpen} aria-controls="design-panel" tabIndex={drawer === name ? 0 : -1} onClick={event => { drawerReturnFocus.current=event.currentTarget; if (drawer === name) setDrawerOpen(open => !open); else { setDrawer(name); setDrawerOpen(true); } }}><DesignPanelIcon name={drawerIcons[name]} /></button></Tooltip>)}</div>
      {drawerOpen && <Tooltip content="Close panel" side="left"><button type="button" className="design-drawer-collapse" aria-label="Close panel" onClick={()=>{setDrawerOpen(false);(drawerReturnFocus.current ?? document.getElementById(`design-tab-${drawer.replaceAll(' ', '-')}`))?.focus();}}><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m8 4 6 6-6 6M4 4l6 6-6 6" /></svg></button></Tooltip>}
      <div className="design-drawer-content" aria-hidden={!drawerOpen} inert={!drawerOpen} onKeyDown={event=>{if(event.key!=='Escape')event.stopPropagation();}}>
      <div className="design-drawer-scroll pp-scrollbar">
      <div className="design-info-title"><div><p className="eyebrow">PROJECT DESIGN</p><h2>{drawer === 'Entity Info' ? 'Model workspace' : drawer}</h2></div></div>
      <div id="design-panel" role="tabpanel" aria-labelledby={`design-tab-${drawer.replaceAll(' ', '-')}`} className="design-info-panel">
        {drawer === 'Entity Info' && <><h3>Selection</h3>{selection ? <><dl className="design-properties"><div><dt>Name</dt><dd><input ref={renameInputRef} key={selection.id} aria-label="Entity name" defaultValue={selection.name} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}} onBlur={e => { const d=working.design;if(e.target.value===selection.name)return;if(d?.instances.some(x=>x.id===selection.id))run({type:'rename',target:'instance',id:selection.id,name:e.target.value});else if(d?.looseObjects.some(x=>x.id===selection.id))run({type:'rename',target:'loose',id:selection.id,name:e.target.value});else if(d?.definitions.some(x=>x.id===selection.id))run({type:'rename',target:'definition',id:selection.id,name:e.target.value}); }} /></dd></div><div><dt>Type</dt><dd>{selection.type}</dd></div><div><dt>State</dt><dd>{selection.state}</dd></div>{selectedInstance&&<div><dt>Cutlist link</dt><dd>{Object.values(working.design?.partLinks??{}).find(link=>link.current?.instanceIds.includes(selectedInstance.id)||link.lastApplied.sources.instanceIds.includes(selectedInstance.id))?.state??'Not linked'}</dd></div>}{selection.dimensions && <div><dt>Grain</dt><dd>{selection.dimensions.grainAxis ?? 'Not specified'}</dd></div>}{selection.dimensions && <><div><dt>Length</dt><dd>{formatLength(selection.dimensions.lengthUm)}</dd></div><div><dt>Width</dt><dd>{formatLength(selection.dimensions.widthUm)}</dd></div><div><dt>Thickness</dt><dd>{formatLength(selection.dimensions.thicknessUm)}</dd></div></>}</dl>
        {(selectedInstance||selectedLoose)&&(()=>{const def=selectedInstance?working.design?.definitions.find(item=>item.id===selectedInstance.definitionId):undefined;const cutSpec=def?.cutSpec;const profile=selectedLoose?getRectangularProfile(selectedLoose.geometry):undefined;if(selectedInstance&&(!cutSpec||cutSpec.kind==='explicit'))return null;if(selectedLoose&&!profile)return null;const lengthUm=cutSpec?.lengthUm??(profile!.maxX-profile!.minX);const widthUm=cutSpec?.widthUm??(profile!.maxY-profile!.minY);const depthUm=cutSpec?.thicknessUm??profile?.depthUm;const locked=selectedInstance?.locked??selectedLoose?.locked??false;const display=(um:number)=>working.unitSystem==='imperial'?inchesFromUm(um).toFixed(6):millimetersFromUm(um).toFixed(3);const unit=working.unitSystem==='imperial'?'in':'mm';const maximum=display(1_000_000_000);return <section className="design-shape-dimensions" aria-label="Shape dimensions"><h4>Shape dimensions</h4>{shapeEditOpen?<form onSubmit={applyShapeDimensions}><label>Length ({unit})<input name="shape-length" type="number" min="0.000001" max={maximum} step="any" inputMode="decimal" defaultValue={display(lengthUm)} required/></label><label>Width ({unit})<input name="shape-width" type="number" min="0.000001" max={maximum} step="any" inputMode="decimal" defaultValue={display(widthUm)} required/></label>{depthUm!==undefined&&<label>Depth ({unit})<input name="shape-depth" type="number" min="0.000001" max={maximum} step="any" inputMode="decimal" defaultValue={display(depthUm)} required/></label>}<div className="design-shape-dimension-actions"><button type="submit" disabled={locked}>Apply dimensions</button><button type="button" onClick={()=>setShapeEditOpen(false)}>Cancel</button></div></form>:<button type="button" onClick={()=>setShapeEditOpen(true)} disabled={locked}>Edit dimensions…</button>}</section>;})()}
          <label>Transform pivot<select aria-label="Transform pivot" value={pivotMode} onChange={event=>setPivotMode(event.target.value as PivotMode)}><option value="origin">Object origin</option><option value="center">Geometry center</option></select></label><label>Transform axes<select aria-label="Transform axes" value={axisMode} onChange={event=>setAxisMode(event.target.value as AxisMode)}><option value="world">World axes</option><option value="local">Local axes</option></select></label>
          <label>Exact value ({lengthUnit}; rotate uses degrees, scale uses ppm)<input aria-label="Exact value" type="number" step="any" value={numeric} onChange={e=>setNumeric(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')applyExact();}} /></label><button type="button" onClick={applyExact}>Apply exact value</button>
          <button type="button" onClick={()=>{const inst=working.design?.instances.find(x=>x.id===selectedId);if(inst)run({type:'duplicate-instance',sourceId:inst.id,id:newId()});}}>Duplicate</button>
          {working.design?.instances.some(x=>x.id===selectedId) && <button type="button" onClick={()=>run({type:'make-unique',instanceId:selectedId!,definitionId:newId()})}>Make Unique</button>}
          {working.design?.looseObjects.some(x=>x.id===selectedId) && <button type="button" onClick={()=>run({type:'make-component',objectId:selectedId,definitionId:newId(),instanceId:newId(),name:'Component'})}>Make Component</button>}
          {(selectedInstance||selectedLoose) && <button type="button" onClick={()=>{if(selectedInstance)run({type:'set-state',target:'instance',id:selectedInstance.id,hidden:!selectedInstance.hidden});else if(selectedLoose)run({type:'set-state',target:'loose',id:selectedLoose.id,hidden:!selectedLoose.hidden});}}>Hide / Show</button>}
          <button type="button" onClick={()=>{if(selectedInstance)run({type:'delete-instance',instanceId:selectedInstance.id});else if(selectedLoose)run({type:'delete-loose',objectId:selectedLoose.id});else if(selectedDefinition)run({type:'delete-definition',definitionId:selectedDefinition.id});}}>Remove</button></> : <p className="design-empty-hint">Select an item in the model or list to inspect its properties.</p>}</>}
        {drawer === 'Materials' && <><h3>Materials</h3>{(() => { const instance = selectedInstance; const definition = selectedDefinition ?? (instance ? working.design?.definitions.find(item => item.id === instance.definitionId) : undefined); const target = instance ? 'instance' as const : definition ? 'definition' as const : undefined; const targetId = instance?.id ?? definition?.id; const materialId = instance?.materialId ?? definition?.materialId; const expectedType = definition?.cutSpec?.kind === 'panel' ? 'sheet' : 'linear'; const choices = working.materials.filter(item => item.type === expectedType); return <>{selection ? <><p>Paint controls visual appearance. It does not change the cutlist material.</p><label>Cutlist material<Select aria-label="Cutlist material" value={materialId ?? '__none'} onValueChange={value => target && targetId && run({type:'set-material',target,id:targetId,materialId:value === '__none' ? undefined : value})} options={[{value:'__none',label:'Unassigned'},...choices.map(item=>({value:item.id,label:item.name}))]}/></label><label>Paint color<input aria-label="Paint color" type="color" value={instance?.appearance?.color ?? definition?.appearance.color ?? '#bd8a56'} onChange={event=>target&&targetId&&run(instance?{type:'set-appearance',instanceId:targetId,color:event.target.value}:{type:'set-appearance',definitionId:targetId,color:event.target.value})}/></label><p className="design-empty-hint">This assignment follows the selected {instance ? 'instance' : 'definition'}; paint remains visual only.</p></> : <p className="design-empty-hint">Select a modeled component to assign its cutlist material. Paint and material are independent.</p>}<h4>Project stock defaults</h4>{working.materials.filter(item=>item.type==='linear').map(item=><div className="design-stock-default" key={item.id}><strong>{item.name}</strong>{item.stocks[0] ? <small>{item.stocks[0].name} · {item.stocks[0].widthUm ? `${formatLength(item.stocks[0].widthUm)}` : 'width unverified'} × {item.stocks[0].thicknessUm ? `${formatLength(item.stocks[0].thicknessUm)}` : 'thickness unverified'}</small> : <small>No stock options</small>}</div>)}{!working.materials.some(item=>item.type==='linear')&&<p className="design-empty-hint">Add a linear material and stock in Cutlist to use project-owned board defaults.</p>}</>; })()}</>}
        {drawer === 'Components' && <><h3>Components</h3><input aria-label="Search components" placeholder="Search components" value={query} onChange={e=>setQuery(e.target.value)} />{objects.length ? <ul className="design-object-list">{objects.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).map(item => <li key={item.id}><button type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><span>{item.name}</span><small>{item.type} · {working.design?.instances.filter(x=>x.definitionId===item.id).length ?? 0} instances</small></button></li>)}</ul> : <p className="design-empty-hint">This project has no model objects yet. Visiting Design does not create one.</p>}<button type="button" onClick={createBoard}>Add board</button></>}
        {drawer === 'Display' && <><h3>View options</h3>{([['grid','Show grid'],['axes','Show axes'],['snap','Snap indicator']] as const).map(([key,label]) => <label className="design-toggle" key={key}><input type="checkbox" checked={view[key]} onChange={event => updateView({ [key]: event.target.checked })} />{label}</label>)}</>}
        {drawer === 'Model Info' && <><h3>Model information</h3><dl className="design-properties"><div><dt>Components</dt><dd>{working.design?.instances.length ?? 0}</dd></div><div><dt>Loose objects</dt><dd>{working.design?.looseObjects.length ?? 0}</dd></div><div><dt>Definitions</dt><dd>{working.design?.definitions.length ?? 0}</dd></div><div><dt>Document</dt><dd>{working.design ? 'Present' : 'Not created'}</dd></div><div><dt>History</dt><dd>{history.cursor} edits</dd></div><div><dt>Project</dt><dd>{saveStatus}</dd></div><div><dt>Cutlist links</dt><dd>{Object.keys(working.design?.partLinks ?? {}).length}</dd></div><div><dt>Unconfirmed cut sizes</dt><dd>{working.design?.definitions.filter(definition=>definition.cutSpec?.confirmation==='requires-confirmation').length??0}</dd></div><div><dt>Unassigned components</dt><dd>{working.design?.instances.filter(instance=>!instance.materialId&&!working.design?.definitions.find(definition=>definition.id===instance.definitionId)?.materialId).length??0}</dd></div></dl><button type="button" onClick={undo} disabled={!history.cursor}>Undo</button><button type="button" onClick={redo} disabled={history.cursor>=history.entries.length}>Redo</button><button type="button" onClick={reviewCutlist} disabled={!working.design}>Review cutlist changes</button>{projectionPreview&&<section className="projection-review" aria-label="Cutlist review"><h4>Review cutlist changes</h4>{working.design&&(()=>{const reviewed=new Set(projectionPreview.rows.flatMap(row=>row.sources.instanceIds));const skipped=working.design.instances.filter(instance=>!instance.projectionExcluded&&!reviewed.has(instance.id)).length;return skipped>0?<p className="design-empty-hint">{skipped} modeled component(s) are not included because their cut size is unconfirmed, material is missing/incompatible, or cut type is unsupported.</p>:null;})()}{!isProjectionPreviewCurrent(projectionPreview,editSequence,localGeneration)&&<p className="warning" role="alert">This preview is stale because the model or saved project changed. Create a new review.</p>}{projectionPreview.changes.map(change=>{const row=projectionPreview.rows.find(item=>item.key===change.rowKey);const decision=projectionDecisions[change.rowKey];return <article key={change.rowKey} className="projection-review-row"><strong>{change.kind}: {row?.fields.name ?? change.partId ?? 'Cutlist row'}</strong><p>{row?`${row.fields.quantity} part(s) · ${formatLength(row.fields.length.um)} long`: 'This linked cutlist row no longer has a matching modeled component.'}</p>{row&&(()=>{const fit=previewStockFit(working,row);return <p className={fit.unverified?'warning':'design-empty-hint'}>{fit.message}</p>;})()}<label>Decision<select aria-label={`Decision for ${row?.fields.name ?? change.partId ?? change.kind}`} value={decision?.disposition ?? ''} onChange={event=>changeProjectionDisposition(change.rowKey,event.target.value as NonNullable<RowDecision['disposition']>)}><option value="">Choose…</option>{change.kind==='remove'?<><option value="keep">Keep manual row</option><option value="detach">Detach from model</option><option value="remove">Remove cutlist row</option></>:<><option value="apply">Apply design values</option><option value="keep">Keep manual values</option><option value="detach">Detach / keep independent</option><option value="remove">Remove cutlist row</option></>}</select></label>{change.conflicts.map(field=><label key={field}>Conflict · {field}<select aria-label={`${field} choice for ${row?.fields.name ?? change.partId ?? change.kind}`} value={decision?.fieldChoices?.[field] ?? ''} onChange={event=>changeProjectionField(change.rowKey,field,event.target.value as 'manual'|'design')}><option value="">Choose…</option><option value="manual">Keep manual</option><option value="design">Use design</option></select></label>)}</article>;})}{projectionPreview.changes.length===0&&<p>No changes are needed.</p>}<button type="button" onClick={applyReviewedCutlist} disabled={projectionBusy||projectionPreview.changes.length===0||!isProjectionPreviewCurrent(projectionPreview,editSequence,localGeneration)}>{projectionBusy?'Saving…':'Apply reviewed changes'}</button><button type="button" onClick={()=>setProjectionPreview(undefined)} disabled={projectionBusy}>Close review</button></section>}</>}
      </div>
      <div className="design-selection-list"><h3>Selection list</h3>{objects.length ? <ul>{objects.map(item => <li key={item.id}><button type="button" aria-current={selectedId === item.id ? 'true' : undefined} onClick={() => { drawerReturnFocus.current=document.getElementById('design-tab-Entity-Info'); setSelectedId(item.id); setDrawer('Entity Info'); setDrawerOpen(true); }}>{item.name}<span>{item.type}</span></button></li>)}</ul> : <p className="design-empty-hint">No model items</p>}</div>
      </div>
      </div>
    </aside>

        <span className="design-axis-label">{activeTool.toUpperCase()} · {view.snap ? 'SNAP ON' : 'SNAP OFF'}</span>
      </div></RadixContextMenu.Trigger><RadixContextMenu.Portal><RadixContextMenu.Content className="design-context-menu" aria-label="Workspace actions" collisionBoundary={viewportBounds ?? undefined} collisionPadding={8} onCloseAutoFocus={event=>{event.preventDefault();if(!renameFocusRequested)contextAnchor.current?.focus();setContext(undefined);}}>
        {selection && <RadixContextMenu.Item onSelect={() => {setDrawer('Entity Info');setDrawerOpen(true);}}>Entity Info</RadixContextMenu.Item>}
        {(selectedInstance&&working.design?.definitions.find(item=>item.id===selectedInstance.definitionId)?.cutSpec?.kind!=='explicit'||selectedLoose&&!!getRectangularProfile(selectedLoose.geometry))&&<RadixContextMenu.Item onSelect={()=>{setShapeEditOpen(true);setDrawer('Entity Info');setDrawerOpen(true);}}>Edit shape dimensions</RadixContextMenu.Item>}
        {selectedInstance && <RadixContextMenu.Item onSelect={() => {setEditingDefinitionId(selectedInstance.definitionId);setNotice(`Editing shared definition · edits affect ${working.design?.instances.filter(item=>item.definitionId===selectedInstance.definitionId).length??0} linked instances`);}}>Edit Component</RadixContextMenu.Item>}
        {selectedDefinition && <RadixContextMenu.Item onSelect={() => {setEditingDefinitionId(selectedDefinition.id);setNotice(`Editing shared definition · ${selectedDefinition.name}`);}}>Edit Definition</RadixContextMenu.Item>}
        {selectedLoose && <RadixContextMenu.Item onSelect={() => run({type:'make-component',objectId:selectedLoose.id,definitionId:newId(),instanceId:newId(),name:selectedLoose.name})}>Make Component</RadixContextMenu.Item>}
        {selectedInstance&&(working.design?.instances.filter(item=>item.definitionId===selectedInstance.definitionId).length??0)>1&&<RadixContextMenu.Item onSelect={()=>run({type:'make-unique',instanceId:selectedInstance.id,definitionId:newId()})}>Make Unique</RadixContextMenu.Item>}
        {selectedInstance && <RadixContextMenu.Item onSelect={() => run({type:'duplicate-instance',sourceId:selectedInstance.id,id:newId()})}>Duplicate</RadixContextMenu.Item>}
        {selection && <RadixContextMenu.Item onSelect={() => {setDrawer('Entity Info');setDrawerOpen(true);setRenameFocusRequested(true);}}>Rename</RadixContextMenu.Item>}
        {(selectedInstance||selectedLoose)&&<RadixContextMenu.Item onSelect={()=>{if(selectedInstance)run({type:'set-state',target:'instance',id:selectedInstance.id,hidden:!selectedInstance.hidden});else if(selectedLoose)run({type:'set-state',target:'loose',id:selectedLoose.id,hidden:!selectedLoose.hidden});}}>{selectedInstance?.hidden||selectedLoose?.hidden?'Show':'Hide'}</RadixContextMenu.Item>}
        {(selectedInstance||selectedLoose||selectedDefinition)&&<RadixContextMenu.Item onSelect={()=>{if(selectedInstance)run({type:'delete-instance',instanceId:selectedInstance.id});else if(selectedLoose)run({type:'delete-loose',objectId:selectedLoose.id});else if(selectedDefinition)run({type:'delete-definition',definitionId:selectedDefinition.id});}}>Erase</RadixContextMenu.Item>}
        {selectedElement?.objectId===selectedId&&<RadixContextMenu.Item onSelect={()=>{const target=selectedElement;if(!target)return;const objectId=target.objectId;if(working.design?.instances.some(item=>item.id===objectId)){const instance=working.design.instances.find(item=>item.id===objectId)!;if(target.type==='face')run({type:'erase-geometry',definitionId:instance.definitionId,target:'face',elementId:target.id});else run({type:'erase-geometry',definitionId:instance.definitionId,target:'edge',elementId:target.id});}else if(target.type==='face')run({type:'erase-loose-geometry',objectId,target:'face',elementId:target.id});else run({type:'erase-loose-geometry',objectId,target:'edge',elementId:target.id});setSelectedElement(undefined);}}>Erase {selectedElement?.type}</RadixContextMenu.Item>}
        <RadixContextMenu.Item onSelect={() => {setSelectedId(undefined);setFrameRequest(n=>n+1);}}>Frame model</RadixContextMenu.Item>
        <RadixContextMenu.Item onSelect={undo}>Undo</RadixContextMenu.Item>
      </RadixContextMenu.Content></RadixContextMenu.Portal></RadixContextMenu.Root>
      <div className="design-status" role="status"><span>{selectionIds.length>1?`${selectionIds.length} items selected`:selection ? `${selection.name}${selectedElement?` · ${selectedElement.type} ${selectedElement.id}`:''} selected` : 'No selection'}</span><span>{toolMeasurement?'Enter to place · Esc to cancel':measurement===undefined?editingDefinitionId?`Shared definition edit · ${working.design?.definitions.find(def=>def.id===editingDefinitionId)?.name??''}`:notice||`${activeTool} · Escape cancels · Ctrl/Cmd+Z undo`:`Measurement: ${formatLength(measurement)} (temporary)`}</span>{toolMeasurement?<ToolMeasurementBox session={toolMeasurement} onChange={setToolMeasurement} onCommit={()=>measurementActions.current?.commit()} onCancel={()=>measurementActions.current?.cancel()} />:<span>{editingDefinitionId&&<button type="button" onClick={()=>setEditingDefinitionId(undefined)}>Exit component edit</button>}{history.cursor ? 'Unsaved project edits' : 'Saved project'}</span>}</div>
    </section>
    {helpOpen && <div role="dialog" aria-modal="true" aria-labelledby="shortcut-title" className="design-help-dialog" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setHelpOpen(false);return;}if(event.key==='Tab'){const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,button,[href],[tabindex]:not([tabindex="-1"])')).filter(element=>!element.hasAttribute('disabled'));const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}><h2 id="shortcut-title">Workspace shortcuts</h2><input autoFocus aria-label="Search shortcuts" placeholder="Search shortcuts" value={helpQuery} onChange={event=>setHelpQuery(event.target.value)} /><ul>{[...tools.map(tool=>({name:tool.label,key:keyLabel(tool.key)})),{name:'Make Component',key:'G'},{name:'Undo',key:'Ctrl/Cmd+Z'},{name:'Redo',key:'Ctrl/Cmd+Shift+Z'},{name:'Duplicate',key:'Ctrl/Cmd+Shift+D'},{name:'Delete',key:'Delete'},{name:'Context menu',key:'Shift+F10 / Menu'}].filter(row=>`${row.name} ${row.key}`.toLowerCase().includes(helpQuery.toLowerCase())).map(row=><li key={row.name}>{row.name}<kbd>{row.key}</kbd></li>)}</ul><button type="button" onClick={()=>setHelpOpen(false)}>Close</button></div>}
    {document.getElementById('design-project-info-action') ? createPortal(<button type="button" className="secondary compact project-info-icon" aria-label="Project Info" title="Project Info" onClick={openProjectInfo}>i</button>, document.getElementById('design-project-info-action')!) : <button type="button" className="secondary compact project-info-icon" aria-label="Project Info" title="Project Info" onClick={openProjectInfo}>i</button>}
    <ProjectInfoDialog open={projectInfoOpen} onOpenChange={setProjectInfoOpen} draft={projectInfoDraft} onDraftChange={setProjectInfoDraft} error={projectInfoError} saving={projectInfoSaving} onSave={() => void saveProjectInfo()} />
  </section>;
}
