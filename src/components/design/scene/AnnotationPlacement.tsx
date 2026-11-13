import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { AnnotationHtml } from './AnnotationHtml';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2 } from 'three';
import type { DesignCommand } from '@/lib/planner/design/commands';
import type { DesignDocumentV1, Vec3Um } from '@/lib/planner/design/schema';
import type { UnitSystem } from '@/lib/planner/model';
import type { AnnotationAnchor } from '@/lib/planner/design/annotations';
import { designVertices } from '../rectangle-plane';
import { cursorPointOnCameraPlane, pickAnnotationAnchor, type AnchorHighlight, type AnchorHover, type SurfaceHit } from '../annotation-pick';
import { findPartFrame, localToWorldUm, resolveAnchorLocalUm, worldUmToLocalUm } from '../annotation-anchor';
import { roundSignedUm, umToMeters } from '@/lib/planner/design/geometry';
import { chooseDimensionMeasure, dimensionOffsetFromDrag, dimensionValueUm } from '../annotation-dimension';
import type { DimensionMeasure } from '@/lib/planner/design/annotations';
import { formatDesignLength } from '@/lib/planner/design/format-length';
import { DimensionGraphic } from './AnnotationOverlay';
import type { RefObject } from 'react';
import { VertexMarker } from './VertexMarker';
import { isEditableTarget } from '@/lib/is-editable-target';

export type TextToolState =
  | { step: 'idle' }
  | { step: 'anchored'; anchor: AnnotationAnchor }
  | { step: 'typing'; anchor: AnnotationAnchor; labelLocalUm: Vec3Um; draft: string; editId?: string };

type Props = {
  design?: DesignDocumentV1;
  unitSystem?: UnitSystem;
  activeTool: string;
  textState: TextToolState;
  setTextState: (state: TextToolState) => void;
  onCommand: (command: DesignCommand) => void;
  onHint: (message: string) => void;
};
type Point = [number, number, number];
const toMeters = (point: readonly number[]): Point => point.map(umToMeters) as Point;

export function DimensionPreviewGraphic({ startWorldM, endWorldM, valueUm, unitSystem, portal }: { startWorldM: Point; endWorldM: Point; valueUm: number; unitSystem: UnitSystem; portal?: RefObject<HTMLElement | null> }) {
  return <group><Line points={[startWorldM, endWorldM]} color="#24506a" lineWidth={1.5} depthTest={false} renderOrder={999} /><AnnotationHtml position={endWorldM.map((v, i) => (v + startWorldM[i]) / 2) as Point} portal={portal} kind="dimension"><span className="design-annotation-label design-annotation-dimension-label">{formatDesignLength(unitSystem, valueUm)}</span></AnnotationHtml></group>;
}

export function AnnotationHoverGraphic({ highlight }: { highlight: AnchorHighlight }) {
  if (highlight.kind === 'point') return <>{highlight.pointsWorldM.map((point, index) => <VertexMarker key={index} point={point} state="hover" />)}</>;
  const points = highlight.kind === 'face' && highlight.pointsWorldM.length > 2 ? [...highlight.pointsWorldM, highlight.pointsWorldM[0]] : highlight.pointsWorldM;
  return <Line points={points} color="#e6a94e" lineWidth={2} depthTest={false} renderOrder={999} />;
}

function AnnotationEditor({ state, onDraft, onCommit, onCancel }: { state: Extract<TextToolState, { step: 'typing' }>; onDraft: (value: string) => void; onCommit: () => void; onCancel: () => void }) {
  const settled = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const refocusAttempted = useRef(false);
  useEffect(() => { settled.current = false; }, [state.editId, state.anchor]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const editor = textarea.current;
      editor?.focus({ preventScroll: true });
      if (state.editId) editor?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.editId]);
  const settle = (callback: () => void) => { if (settled.current) return; settled.current = true; callback(); };
  return <AnnotationHtml position={toMeters(state.labelLocalUm)} transform={false} interactive>
    <textarea ref={textarea} className="design-annotation-editor" aria-label="Annotation text" maxLength={500} rows={1} value={state.draft}
      onChange={event => onDraft(event.currentTarget.value)}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); settle(onCommit); } else if (event.key === 'Escape') { event.preventDefault(); settle(onCancel); } }}
      onBlur={() => {
        if (state.draft.trim()) { settle(onCommit); return; }
        if (refocusAttempted.current) return;
        refocusAttempted.current = true;
        requestAnimationFrame(() => textarea.current?.focus({ preventScroll: true }));
      }} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} />
  </AnnotationHtml>;
}

export function AnnotationPlacement(props: Props) {
  const { camera, gl, scene, invalidate } = useThree();
  const candidates = useMemo(() => designVertices(props.design), [props.design]);
  const [hover, setHover] = useState<AnchorHover>();
  const [cursorWorldM, setCursorWorldM] = useState<Point>();
  const [dimensionState, setDimensionState] = useState<{ step: 'idle' } | { step: 'started'; start: AnnotationAnchor } | { step: 'ended'; start: AnnotationAnchor; end: AnnotationAnchor }>({ step: 'idle' });
  const dimensionStateRef = useRef(dimensionState);
  const [dimensionCursor, setDimensionCursor] = useState<Point>();
  const current = useRef(props);
  const swallowNextClick = useRef(false);
  const pointerStart = useRef<{ id: number; x: number; y: number; dragged: boolean } | undefined>(undefined);
  const { activeTool, design, setTextState } = props;
  useLayoutEffect(() => { current.current = props; });
  const state = props.textState;
  const worldFor = (anchor: AnnotationAnchor, design?: DesignDocumentV1): Point | undefined => {
    const frame = design && findPartFrame(design, anchor.target);
    if (!frame) return undefined;
    const point = resolveAnchorLocalUm(anchor, frame);
    const world = localToWorldUm(point, frame);
    return world?.map(umToMeters) as Point | undefined;
  };
  const worldUm = (anchor: AnnotationAnchor, design?: DesignDocumentV1): Vec3Um | undefined => { const point = worldFor(anchor, design); return point?.map(value => roundSignedUm(value * 1_000_000)) as Vec3Um | undefined; };
  useLayoutEffect(() => { dimensionStateRef.current = dimensionState; }, [dimensionState]);
  useEffect(() => {
    const state = current.current.textState;
    if (activeTool !== 'text' && state.step !== 'idle') setTextState({ step: 'idle' });
    if (activeTool !== 'dimensions' && dimensionStateRef.current.step !== 'idle') {
      setDimensionState({ step: 'idle' });
      setDimensionCursor(undefined);
    }
    if (state.step !== 'idle' && (!design || !findPartFrame(design, state.anchor.target))) setTextState({ step: 'idle' });
    if (dimensionStateRef.current.step !== 'idle') {
      const step = dimensionStateRef.current;
      const hasMissingTarget = step.step === 'started'
        ? !design || !findPartFrame(design, step.start.target)
        : !design || !findPartFrame(design, step.start.target) || !findPartFrame(design, step.end.target);
      if (hasMissingTarget) { setDimensionState({ step: 'idle' }); setDimensionCursor(undefined); }
    }
  }, [activeTool, design, setTextState]);
  const pick = (event: PointerEvent | MouseEvent) => {
    const p = current.current, rect = gl.domElement.getBoundingClientRect();
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
    const meshes: import('three').Mesh[] = [];
    scene.traverse(object => { if ((object as import('three').Mesh).isMesh && typeof object.userData.designTargetId === 'string') meshes.push(object as import('three').Mesh); });
    const hit = raycaster.intersectObjects(meshes, false)[0];
    let surface: SurfaceHit | undefined;
    if (hit) {
      const local = hit.object.worldToLocal(hit.point.clone());
      surface = { objectId: hit.object.userData.designTargetId as string, localPointM: local.toArray(), ...(hit.face ? { localNormal: hit.face.normal.toArray() } : {}) };
    }
    return p.design ? pickAnnotationAnchor({ design: p.design, candidates, camera, rect, clientX: event.clientX, clientY: event.clientY, hit: surface, vertexOnly: false }) : undefined;
  };
  useEffect(() => {
    if (props.activeTool === 'dimensions') { props.onHint(dimensionState.step === 'idle' ? 'Dimensions · click a corner to start' : dimensionState.step === 'started' ? 'Dimensions · click a second corner' : 'Dimensions · move away from the model and click to set the position'); return; }
    if (props.activeTool !== 'text') return;
    props.onHint(state.step === 'idle' ? 'Text · click a corner, edge, or face to anchor a note' : state.step === 'anchored' ? 'Text · click to place the label' : 'Text · Enter to commit · Shift+Enter for a new line · Esc to cancel');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeTool, state.step, dimensionState.step]);
  useEffect(() => {
    const canvas = gl.domElement;
    const outsidePointerDown = (event: PointerEvent) => {
      const p = current.current;
      if (p.textState.step !== 'typing' || (event.target instanceof Element && event.target.closest('.design-annotation-editor'))) return;
      if (!p.textState.draft.trim()) {
        p.onHint('Text · empty note discarded');
        p.setTextState({ step: 'idle' });
      }
    };
    const move = (event: PointerEvent) => {
      if (current.current.activeTool === 'dimensions') {
        const p = current.current, step = dimensionStateRef.current, rect = canvas.getBoundingClientRect();
        const picked = p.design ? pickAnnotationAnchor({ design: p.design, candidates, camera, rect, clientX: event.clientX, clientY: event.clientY, vertexOnly: true }) : undefined;
        setHover(picked);
        invalidate();
        const a = step.step !== 'idle' ? worldUm(step.start, p.design) : undefined;
        if (step.step === 'started' && a) setDimensionCursor(cursorPointOnCameraPlane(camera, rect, event.clientX, event.clientY, worldFor(step.start, p.design)!));
        if (step.step === 'ended' && a) { const b = worldUm(step.end, p.design); if (b) { const mid = a.map((v, i) => (v + b[i]) / 2) as Vec3Um; setDimensionCursor(cursorPointOnCameraPlane(camera, rect, event.clientX, event.clientY, toMeters(mid))); } }
        return;
      }
      if (current.current.activeTool !== 'text') return;
      const next = current.current.textState;
      const picked = pick(event); setHover(picked); invalidate();
      if (next.step === 'anchored') {
        const anchorWorld = worldFor(next.anchor, current.current.design);
        const rect = canvas.getBoundingClientRect();
        if (anchorWorld) setCursorWorldM(cursorPointOnCameraPlane(camera, rect, event.clientX, event.clientY, anchorWorld));
      }
    };
    const down = (event: PointerEvent) => {
      if (!['text', 'dimensions'].includes(current.current.activeTool) || event.button !== 0) return;
      pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      if (current.current.textState.step === 'typing') swallowNextClick.current = true;
      event.stopImmediatePropagation();
    };
    const pointerMove = (event: PointerEvent) => {
      const start = pointerStart.current;
      if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) start.dragged = true;
    };
    const up = (event: PointerEvent) => {
      if (['text', 'dimensions'].includes(current.current.activeTool) && event.button === 0) event.stopImmediatePropagation();
      const start = pointerStart.current;
      if (start?.id === event.pointerId) { if (start.dragged) swallowNextClick.current = true; pointerStart.current = undefined; }
    };
    const cancelPointer = (event: PointerEvent) => { if (pointerStart.current?.id === event.pointerId) pointerStart.current = undefined; };
    const click = (event: MouseEvent) => {
      const p = current.current;
      if (p.activeTool === 'dimensions') {
        event.stopImmediatePropagation();
        const step = dimensionStateRef.current;
        const picked = p.design ? pickAnnotationAnchor({ design: p.design, candidates, camera, rect: canvas.getBoundingClientRect(), clientX: event.clientX, clientY: event.clientY, vertexOnly: true }) : undefined;
        if (step.step === 'idle') { if (picked) setDimensionState({ step: 'started', start: picked.anchor }); else p.onHint('Dimensions · pick a corner of a part'); return; }
        if (step.step === 'started') {
          if (!picked) { p.onHint('Dimensions · pick a corner of a part'); return; }
          const a=step.start, b=picked.anchor;
          if(a.target.kind===b.target.kind&&a.target.id===b.target.id&&a.element.id===b.element.id){p.onHint('Dimensions · pick a different corner');return;}
          setDimensionState({step:'ended',start:a,end:b}); return;
        }
        const a=worldUm(step.start,p.design), b=worldUm(step.end,p.design);
        if (!a || !b) return;
        const mid=a.map((v,i)=>(v+b[i])/2) as Vec3Um, cursor=cursorPointOnCameraPlane(camera,canvas.getBoundingClientRect(),event.clientX,event.clientY,toMeters(mid));
        if(!cursor) return;
        const drag=cursor.map((v,i)=>roundSignedUm(v*1_000_000)-mid[i]);
        const measure=chooseDimensionMeasure(a,b,drag), offsetUm=dimensionOffsetFromDrag(a,b,measure,drag);
        p.onCommand({type:'add-annotation',annotation:{id:crypto.randomUUID(),kind:'dimension',start:step.start,end:step.end,measure,offsetUm}});
        setDimensionState({step:'idle'}); setDimensionCursor(undefined); return;
      }
      if (p.activeTool !== 'text') return;
      if (swallowNextClick.current) { swallowNextClick.current = false; event.stopImmediatePropagation(); return; }
      event.stopImmediatePropagation();
      const next = p.textState;
      if (next.step === 'typing') return;
      if (next.step === 'idle') {
        const picked = pick(event);
        if (picked) { setHover(picked); p.setTextState({ step: 'anchored', anchor: picked.anchor }); }
        else p.onHint('Text · click a corner, edge, or face to anchor a note');
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const anchorWorld = worldFor(next.anchor, p.design);
      const frame = p.design && findPartFrame(p.design, next.anchor.target);
      const world = anchorWorld && cursorPointOnCameraPlane(camera, rect, event.clientX, event.clientY, anchorWorld);
      if (!frame || !world) return;
      const labelLocalUm = worldUmToLocalUm(world.map(value => roundSignedUm(value * 1_000_000)) as Vec3Um, frame);
      p.setTextState({ step: 'typing', anchor: next.anchor, labelLocalUm, draft: '' });
    };
    const leave = () => { setHover(undefined); invalidate(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isEditableTarget(event.target)) { if (current.current.textState.step !== 'idle') { event.preventDefault(); current.current.setTextState({ step: 'idle' }); } if (dimensionStateRef.current.step !== 'idle') { event.preventDefault(); setDimensionState({ step: 'idle' }); setDimensionCursor(undefined); } } };
    canvas.addEventListener('pointermove', move); window.addEventListener('pointermove', pointerMove, true); canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointerup', up, true); canvas.addEventListener('pointercancel', cancelPointer, true); canvas.addEventListener('click', click, true); canvas.addEventListener('pointerleave', leave); window.addEventListener('keydown', escape); window.addEventListener('pointerdown', outsidePointerDown, true);
    return () => { canvas.removeEventListener('pointermove', move); window.removeEventListener('pointermove', pointerMove, true); canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointerup', up, true); canvas.removeEventListener('pointercancel', cancelPointer, true); canvas.removeEventListener('click', click, true); canvas.removeEventListener('pointerleave', leave); window.removeEventListener('keydown', escape); window.removeEventListener('pointerdown', outsidePointerDown, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, scene, candidates, invalidate]);
  const setDraft = (draft: string) => { const latest = current.current.textState; if (latest.step === 'typing') current.current.setTextState({ ...latest, draft }); };
  const finish = (commit: boolean) => {
    const p = current.current, latest = p.textState;
    if (latest.step !== 'typing') return;
    const text = latest.draft.trim();
    if (commit && latest.editId) {
      const existing = p.design?.annotations?.find(annotation => annotation.id === latest.editId);
      if (text !== (existing?.kind === 'text' ? existing.text : '')) {
        if (!text) p.onCommand({ type: 'delete-annotation', annotationId: latest.editId });
        else if (existing?.kind === 'text') p.onCommand({ type: 'update-annotation', annotation: { ...existing, text } });
      }
    } else if (commit && text) p.onCommand({ type: 'add-annotation', annotation: { id: crypto.randomUUID(), kind: 'text', anchor: latest.anchor, text, labelLocalUm: latest.labelLocalUm } });
    else if (commit) p.onHint('Text · empty note discarded');
    p.setTextState({ step: 'idle' });
  };
  const anchorWorld = state.step === 'anchored' || state.step === 'typing' ? worldFor(state.anchor, props.design) : undefined;
  const labelFrame = state.step === 'typing' && props.design ? findPartFrame(props.design, state.anchor.target) : undefined;
  const labelWorld = state.step === 'typing' && labelFrame ? localToWorldUm(state.labelLocalUm, labelFrame)?.map(umToMeters) as Point : cursorWorldM;
  let dimensionGraphic: React.ReactNode = null;
  if (dimensionState.step !== 'idle') {
    const a=worldUm(dimensionState.start,props.design), b=dimensionState.step==='ended'?worldUm(dimensionState.end,props.design):undefined;
    if(a){
      if(dimensionState.step==='started'){
        const hoverAnchor=hover?.anchor, end=hoverAnchor&&worldUm(hoverAnchor,props.design) || (dimensionCursor?.map(v=>roundSignedUm(v*1_000_000)) as Vec3Um|undefined);
        if(end) dimensionGraphic=<DimensionPreviewGraphic startWorldM={toMeters(a)} endWorldM={toMeters(end)} valueUm={dimensionValueUm(a,end,'direct')} unitSystem={props.unitSystem ?? 'metric'} />;
      } else if(b&&dimensionCursor){ const mid=a.map((v,i)=>(v+b[i])/2) as Vec3Um, drag=dimensionCursor.map((v,i)=>roundSignedUm(v*1_000_000)-mid[i]), measure:DimensionMeasure=chooseDimensionMeasure(a,b,drag), offset=dimensionOffsetFromDrag(a,b,measure,drag); dimensionGraphic=<DimensionGraphic startWorldM={toMeters(a)} endWorldM={toMeters(b)} measure={measure} offsetUm={offset} valueUm={dimensionValueUm(a,b,measure)} unitSystem={props.unitSystem ?? 'metric'} />; }
    }
  }
  return <>
    {((props.activeTool === 'text' && (state.step === 'idle' || state.step === 'anchored')) || props.activeTool === 'dimensions') && hover && <AnnotationHoverGraphic highlight={hover.highlight} />}
    {(state.step === 'anchored' || state.step === 'typing') && anchorWorld && <VertexMarker point={anchorWorld} state="selected" />}
    {dimensionState.step !== 'idle' && <>
      {worldFor(dimensionState.start, props.design) && <VertexMarker point={worldFor(dimensionState.start, props.design)!} state="selected" />}
      {dimensionState.step === 'ended' && worldFor(dimensionState.end, props.design) && <VertexMarker point={worldFor(dimensionState.end, props.design)!} state="selected" />}
    </>}
    {(state.step === 'anchored' || state.step === 'typing') && anchorWorld && labelWorld && <Line points={[anchorWorld, labelWorld]} color="#24506a" lineWidth={1.5} depthTest={false} renderOrder={999} />}
    {state.step === 'typing' && labelWorld && <AnnotationEditor state={{ ...state, labelLocalUm: labelWorld.map(value => value * 1_000_000) as Vec3Um }} onDraft={setDraft} onCommit={() => finish(true)} onCancel={() => finish(false)} />}
    {dimensionGraphic}
  </>;
}
