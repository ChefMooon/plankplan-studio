import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Line } from '@react-three/drei';
import { AnnotationHtml } from './AnnotationHtml';
import { useThree } from '@react-three/fiber';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DesignCommand } from '@/lib/planner/design/commands';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import { chooseDimensionMeasure, dimensionLayoutUm, dimensionOffsetFromDrag } from '../annotation-dimension';
import type { DimensionMeasure } from '@/lib/planner/design/annotations';
import { resolveAllAnnotations, type ResolvedAnnotation } from '../annotation-anchor';
import { formatDesignLength } from '@/lib/planner/design/format-length';
import { cursorPointOnCameraPlane } from '../annotation-pick';
import { findPartFrame, worldUmToLocalUm } from '../annotation-anchor';
import type { TextToolState } from './AnnotationPlacement';

type Point = [number, number, number];
const meters = (point: readonly number[]): Point => point.map(value => value / 1_000_000) as Point;
const lineProps = { color: '#24506a', lineWidth: 1.5, depthTest: false, renderOrder: 999 } as const;

// eslint-disable-next-line react-refresh/only-export-components -- This pure predicate is intentionally exported for unit tests.
export function annotationInteractive(activeTool: string, kind: 'text' | 'dimension'): boolean {
  return activeTool === 'select' || activeTool === 'erase' || (activeTool === 'text' && kind === 'text') || (activeTool === 'dimensions' && kind === 'dimension');
}

export function TextNoteGraphic({ anchorWorldM, labelWorldM, text, selected = false, interactive = false, onPointerDown, onDoubleClick, onClick }: { anchorWorldM: Point; labelWorldM: Point; text: string; selected?: boolean; interactive?: boolean; onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void; onDoubleClick?: () => void; onClick?: (event: React.MouseEvent<HTMLDivElement>) => void }) {
  return <group>
    <Line points={[anchorWorldM, labelWorldM]} {...lineProps} color={selected ? '#e6a94e' : lineProps.color} />
    <AnnotationHtml position={anchorWorldM}><span className="design-annotation-dot" /></AnnotationHtml>
    <AnnotationHtml position={labelWorldM} interactive={interactive}><div className={`design-annotation-label${selected ? ' is-selected' : ''}${interactive ? ' is-interactive' : ''}`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClick={onClick}>{text}</div></AnnotationHtml>
  </group>;
}

export function DimensionGraphic({ startWorldM, endWorldM, measure, offsetUm, valueUm, unitSystem, selected = false, interactive = false, onPointerDown, onClick, portal }: { startWorldM: Point; endWorldM: Point; measure: 'x' | 'y' | 'z' | 'direct'; offsetUm: [number, number, number]; valueUm: number; unitSystem: UnitSystem; selected?: boolean; interactive?: boolean; onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void; onClick?: (event: React.MouseEvent<HTMLDivElement>) => void; portal?: RefObject<HTMLElement | null> }) {
  const layout = dimensionLayoutUm(startWorldM.map(value => value * 1_000_000) as Point, endWorldM.map(value => value * 1_000_000) as Point, measure, offsetUm);
  const color = selected ? '#e6a94e' : lineProps.color;
  const start = meters(layout.lineStart), end = meters(layout.lineEnd);
  const labelPoint = meters(layout.labelPoint);
  return <group>
    <Line points={layout.extensionA.map(meters)} {...lineProps} color={color} />
    <Line points={layout.extensionB.map(meters)} {...lineProps} color={color} />
    <Line points={[start, end]} {...lineProps} color={color} />
    <AnnotationHtml position={labelPoint} interactive={interactive} portal={portal}><div className={`design-annotation-label design-annotation-dimension-label${selected ? ' is-selected' : ''}${interactive ? ' is-interactive' : ''}`} onPointerDown={onPointerDown} onClick={onClick}>{formatDesignLength(unitSystem, valueUm)}</div></AnnotationHtml>
  </group>;
}

function AnnotationGraphic({ resolved, annotation, unitSystem, selected, activeTool, onTextPointerDown, onDimensionPointerDown, onEdit, onLabelClick, editing }: { resolved: ResolvedAnnotation; annotation: NonNullable<DesignDocumentV1['annotations']>[number]; unitSystem: UnitSystem; selected: boolean; activeTool: string; onTextPointerDown: (event: ReactPointerEvent<HTMLDivElement>, annotation: Extract<NonNullable<DesignDocumentV1['annotations']>[number], { kind: 'text' }>, labelWorldM: Point) => void; onDimensionPointerDown: (event: ReactPointerEvent<HTMLDivElement>, annotation: Extract<NonNullable<DesignDocumentV1['annotations']>[number], { kind: 'dimension' }>, start: Point, end: Point) => void; onEdit: (annotation: Extract<NonNullable<DesignDocumentV1['annotations']>[number], { kind: 'text' }>) => void; onLabelClick: (event: React.MouseEvent<HTMLDivElement>, id: string) => void; editing?: { annotationId: string; draft: string } }) {
  if (resolved.kind === 'text' && annotation.kind === 'text') {
    if (editing?.annotationId === annotation.id) return null;
    const labelWorldM = meters(resolved.labelWorldUm);
    return <TextNoteGraphic anchorWorldM={meters(resolved.anchorWorldUm)} labelWorldM={labelWorldM} text={annotation.text} selected={selected} interactive={annotationInteractive(activeTool, 'text')} onPointerDown={event => { if(activeTool==='select'||activeTool==='erase')event.stopPropagation(); onTextPointerDown(event, annotation, labelWorldM); }} onClick={event=>onLabelClick(event,annotation.id)} onDoubleClick={() => onEdit(annotation)} />;
  }
  if (resolved.kind === 'dimension' && annotation.kind === 'dimension') return <DimensionGraphic startWorldM={meters(resolved.startWorldUm)} endWorldM={meters(resolved.endWorldUm)} measure={resolved.measure} offsetUm={resolved.offsetUm} valueUm={resolved.valueUm} unitSystem={unitSystem} selected={selected} interactive={annotationInteractive(activeTool, 'dimension')} onPointerDown={event => { if(activeTool==='select'||activeTool==='erase')event.stopPropagation(); onDimensionPointerDown(event, annotation, meters(resolved.startWorldUm), meters(resolved.endWorldUm)); }} onClick={event=>onLabelClick(event,annotation.id)} />;
  return null;
}

export function AnnotationOverlay({ design, unitSystem, activeTool, selectedAnnotationId, onCommand, onHint, onSelectAnnotation, textState, setTextState }: { design?: DesignDocumentV1; unitSystem: UnitSystem; activeTool: string; selectedAnnotationId?: string; onCommand: (command: DesignCommand) => void; onHint: (message: string) => void; onSelectAnnotation: (id?: string) => void; textState: TextToolState; setTextState: (state: TextToolState) => void }) {
  const { camera, gl } = useThree();
  const resolved = useMemo(() => resolveAllAnnotations(design), [design]);
  const [dimensionPreview, setDimensionPreview] = useState<{ id:string; measure:DimensionMeasure; offsetUm:[number,number,number] }>();
  const activeDrags = useRef(new Set<() => void>());
  useEffect(() => () => { activeDrags.current.forEach(cleanup => cleanup()); activeDrags.current.clear(); }, [activeTool]);
  const annotations = design?.annotations ?? [];
  const storedById = new Map(annotations.map(annotation => [annotation.id, annotation]));
  const edit = (annotation: Extract<NonNullable<DesignDocumentV1['annotations']>[number], { kind: 'text' }>) => {
    setTextState({ step: 'typing', anchor: annotation.anchor, labelLocalUm: annotation.labelLocalUm, draft: annotation.text, editId: annotation.id });
    onHint('Text · Enter to commit · Shift+Enter for a new line · Esc to cancel');
  };
  const labelClick = (event: React.MouseEvent<HTMLDivElement>, id: string) => {
    if (activeTool !== 'select' && activeTool !== 'erase') return;
    event.stopPropagation();
    if (activeTool === 'select') onSelectAnnotation(id);
    else onCommand({ type: 'delete-annotation', annotationId: id });
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, annotation: Extract<NonNullable<DesignDocumentV1['annotations']>[number], { kind: 'text' }>, labelWorldM: Point) => {
    if (activeTool !== 'text' || event.button !== 0) return;
    event.stopPropagation();
    const startX = event.clientX, startY = event.clientY;
    let dragged = false;
    const pointerId = event.pointerId;
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); activeDrags.current.delete(cleanup); };
    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      if (!dragged && Math.hypot(native.clientX - startX, native.clientY - startY) > 3) dragged = true;
    };
    const up = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      cleanup();
      if (!dragged) { edit(annotation); return; }
      const world = cursorPointOnCameraPlane(camera, gl.domElement.getBoundingClientRect(), native.clientX, native.clientY, labelWorldM);
      const frame = design && findPartFrame(design, annotation.anchor.target);
      if (!world || !frame) return;
      const local = worldUmToLocalUm(world.map(value => Math.round(value * 1_000_000)) as [number, number, number], frame);
      onCommand({ type: 'update-annotation', annotation: { ...annotation, labelLocalUm: local } });
    };
    const cancel = (native: PointerEvent) => { if (native.pointerId === pointerId) cleanup(); };
    activeDrags.current.add(cleanup);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  };
  const startDimensionDrag = (event: ReactPointerEvent<HTMLDivElement>, annotation: Extract<NonNullable<DesignDocumentV1['annotations']>[number], { kind: 'dimension' }>, start: Point, end: Point) => {
    if (activeTool !== 'dimensions' || event.button !== 0) return;
    event.stopPropagation();
    const startX=event.clientX,startY=event.clientY, a=start.map(v=>Math.round(v*1e6)), b=end.map(v=>Math.round(v*1e6)), midpoint=a.map((v,i)=>(v+b[i])/2), through=midpoint.map(v=>v/1e6) as Point;
    let dragged=false, latest:{measure:DimensionMeasure;offsetUm:[number,number,number]}|undefined;
    const move=(native:PointerEvent)=>{if(!dragged&&Math.hypot(native.clientX-startX,native.clientY-startY)>3)dragged=true;if(!dragged)return;const cursor=cursorPointOnCameraPlane(camera,gl.domElement.getBoundingClientRect(),native.clientX,native.clientY,through);if(!cursor)return;const drag=cursor.map((v,i)=>Math.round(v*1e6)-midpoint[i]) as [number,number,number];const measure=chooseDimensionMeasure(a as [number,number,number],b as [number,number,number],drag);latest={measure,offsetUm:dimensionOffsetFromDrag(a as [number,number,number],b as [number,number,number],measure,drag)};setDimensionPreview({id:annotation.id,...latest});};
    const pointerId=event.pointerId;
    const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);activeDrags.current.delete(cleanup);};
    const up=(native:PointerEvent)=>{if(native.pointerId!==pointerId)return;cleanup();setDimensionPreview(undefined);if(dragged&&latest)onCommand({type:'update-annotation',annotation:{...annotation,...latest}});};
    const cancel=(native:PointerEvent)=>{if(native.pointerId!==pointerId)return;cleanup();setDimensionPreview(undefined);};
    activeDrags.current.add(cleanup);
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
  };
  return <group>
    {resolved.map(item => {
      const annotation = storedById.get(item.id);
      if (annotation?.kind === 'dimension' && item.kind === 'dimension' && dimensionPreview?.id === item.id) return <DimensionGraphic key={item.id} startWorldM={meters(item.startWorldUm)} endWorldM={meters(item.endWorldUm)} measure={dimensionPreview.measure} offsetUm={dimensionPreview.offsetUm} valueUm={dimensionPreview.measure==='direct'?Math.round(Math.hypot(...item.endWorldUm.map((v,i)=>v-item.startWorldUm[i]))):Math.abs(item.endWorldUm['xyz'.indexOf(dimensionPreview.measure)]-item.startWorldUm['xyz'.indexOf(dimensionPreview.measure)])} unitSystem={unitSystem} interactive />;
      return annotation ? <AnnotationGraphic key={item.id} resolved={item} annotation={annotation} unitSystem={unitSystem} selected={item.id === selectedAnnotationId} activeTool={activeTool} onTextPointerDown={startDrag} onDimensionPointerDown={startDimensionDrag} onEdit={edit} onLabelClick={labelClick} editing={textState.step === 'typing' && textState.editId ? { annotationId: textState.editId, draft: textState.draft } : undefined} /> : null;
    })}
  </group>;
}
