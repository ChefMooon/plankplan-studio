import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { DoubleSide, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import type { DesignCommand } from '@/lib/planner/design/commands';
import type { UnitSystem } from '@/lib/planner/model';
import { designVertices, directRectangleEnd, fromPlane, planeCoordinates, rectangleCommand, rectanglePlaneAxes, reorientRectangleEnd, type RectangleAxis, type RectangleDirection, type VertexTarget } from '../rectangle-plane';
import { parseMeasurement, type ToolMeasurementSession } from '../tool-measurements';
import type { SubElement } from '../sub-selection';

type Props = {
  design?: DesignDocumentV1; editingDefinitionId?: string; activeTool: string; axis: RectangleAxis; direction: RectangleDirection; snap: boolean; unitSystem: UnitSystem;
  selectedElement?: { objectId: string } & SubElement;
  onSelect: (id?: string, additive?: boolean, subtractive?: boolean, shiftOnly?: boolean) => void; onSubSelect?: (id: string, element?: SubElement) => void;
  onCommand: (command: DesignCommand) => void; onToolError: (message: string) => void;
  toolMeasurement?: ToolMeasurementSession; onToolMeasurementChange: (session?: ToolMeasurementSession) => void;
  onRegisterMeasurementActions: (actions?: { commit: () => void; cancel: () => void }) => void;
};
type Gesture = { start: [number, number, number]; end: [number, number, number]; axis: RectangleAxis; id: string };
export function VertexDrawing(props: Props) {
  const { camera, gl, size, invalidate } = useThree();
  const candidates = useMemo(() => designVertices(props.design, props.editingDefinitionId), [props.design, props.editingDefinitionId]);
  const [hover, setHover] = useState<VertexTarget>();
  const [gesture, setGesture] = useState<Gesture>();
  const current = useRef(props);
  useLayoutEffect(() => { current.current = props; });
  const gestureRef = useRef(gesture);
  const selected = candidates.find(v => v.objectId === props.selectedElement?.objectId && v.id === props.selectedElement.id);
  const marker = hover ?? selected;
  const markerRef = useRef<import('three').Mesh>(null);
  useFrame(() => {
    if (!markerRef.current || !marker) return;
    const point = new Vector3(...marker.point);
    const projected = point.clone().project(camera);
    const adjacent = new Vector3(projected.x + 14 / size.width, projected.y, projected.z).unproject(camera);
    markerRef.current.scale.setScalar(point.distanceTo(adjacent));
    markerRef.current.quaternion.copy(camera.quaternion);
  });
  const result = (g: Gesture, p: Props) => {
    const fields = p.toolMeasurement?.id === g.id ? p.toolMeasurement.fields : [];
    const values = ['width', 'depth'].map(id => {
      const field = fields.find(f => f.id === id);
      if (!field?.exact) return undefined;
      const value = parseMeasurement(field.value, 0.001);
      return value === undefined ? NaN : Math.round(value * (p.unitSystem === 'imperial' ? 25400 : 1000));
    });
    const end = reorientRectangleEnd(g.start, g.end, g.axis, p.axis);
    const a = planeCoordinates(g.start, p.axis), b = planeCoordinates(end, p.axis);
    return rectangleCommand(g.start, directRectangleEnd(g.start, end, p.axis, p.direction), p.axis, values[0] ?? Math.abs(b[0] - a[0]), values[1] ?? Math.abs(b[1] - a[1]));
  };
  const cancel = () => { gestureRef.current = undefined; setGesture(undefined); current.current.onToolMeasurementChange(undefined); current.current.onRegisterMeasurementActions(undefined); };
  const commit = (g = gestureRef.current) => {
    if (!g) return;
    const command = result(g, current.current);
    if (!command) { current.current.onToolError('Choose two positive dimensions for the rectangle'); return; }
    current.current.onCommand(command); cancel(); current.current.onToolError('Rectangle placed');
  };
  useEffect(() => {
    if (!gesture) return;
    props.onRegisterMeasurementActions({ commit: () => commit(), cancel });

  });
  useEffect(() => {
    const canvas = gl.domElement;
    const pick = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      let best: VertexTarget | undefined; let distance = 12;
      for (const target of candidates) {
        const projected = new Vector3(...target.point).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const d = Math.hypot(rect.left + (projected.x + 1) * rect.width / 2 - event.clientX, rect.top + (1 - projected.y) * rect.height / 2 - event.clientY);
        if (d < distance) { distance = d; best = target; }
      }
      return best;
    };
    const point = (event: PointerEvent): [number, number, number] | undefined => {
      const p = current.current, g = gestureRef.current;
      const candidate = p.snap && !event.altKey && !g ? pick(event) : undefined;
      setHover(candidate); invalidate();
      if (candidate) return candidate.point.map(n => Math.round(n * 1_000_000)) as [number, number, number];
      const rect = canvas.getBoundingClientRect(), ray = new Raycaster();
      ray.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
      const normal = new Vector3(p.axis === 'x' ? 1 : 0, p.axis === 'y' ? 1 : 0, p.axis === 'z' ? 1 : 0);
      const origin = g ? new Vector3(...g.start.map(n => n / 1_000_000)) : new Vector3();
      const hit = ray.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal, origin), new Vector3());
      if (!hit) return;
      const coordinates = planeCoordinates(hit.toArray().map(n => Math.round(n * 1_000_000)), p.axis);
      const round = (n: number) => p.snap && !event.altKey ? Math.round(n / 10_000) * 10_000 : n;
      return fromPlane(round(coordinates[0]), round(coordinates[1]), g ? planeCoordinates(g.start, p.axis)[2] : 0, p.axis);
    };
    const move = (event: PointerEvent) => {
      const p = current.current;
      if (p.activeTool === 'select') { setHover(pick(event)); invalidate(); return; }
      if (p.activeTool !== 'rectangle') return;
      const end = point(event), g = gestureRef.current;
      if (!end || !g) return;
      const next = { ...g, end, axis: p.axis }; gestureRef.current = next; setGesture(next);
      const a = planeCoordinates(g.start, p.axis), b = planeCoordinates(end, p.axis);
      if (p.toolMeasurement?.id === g.id) p.onToolMeasurementChange({ ...p.toolMeasurement, canPlace: !!result(next, p), fields: p.toolMeasurement.fields.map((f, i) => f.exact ? f : { ...f, value: (Math.abs(b[i] - a[i]) / (p.unitSystem === 'imperial' ? 25400 : 1000)).toFixed(3) }) });
    };
    const down = (event: PointerEvent) => {
      const p = current.current;
      if (event.button !== 0) return;
      if (p.activeTool === 'rectangle' || p.activeTool === 'select') canvas.closest<HTMLElement>('.design-viewport')?.focus();
      if (p.activeTool === 'select') {
        const target = pick(event); if (!target) return;
        event.stopImmediatePropagation(); p.onSelect(target.objectId, event.shiftKey || event.ctrlKey, event.shiftKey && event.ctrlKey, event.shiftKey && !event.ctrlKey); p.onSubSelect?.(target.objectId, { type: 'vertex', id: target.id }); return;
      }
      if (p.activeTool !== 'rectangle') return;
      event.stopImmediatePropagation();
      const end = point(event); if (!end) { p.onToolError('Drawing plane is edge-on · orbit or change the view'); return; }
      if (gestureRef.current) { commit({ ...gestureRef.current, end, axis: p.axis }); return; }
      const id = crypto.randomUUID(), next = { id, start: end, end, axis: p.axis };
      gestureRef.current = next; setGesture(next);
      p.onToolMeasurementChange({ id, tool: 'Rectangle', canPlace: false, fields: [{ id: 'width', label: `Width (${rectanglePlaneAxes(p.axis)[0]})`, value: '0', unit: p.unitSystem === 'imperial' ? 'in' : 'mm', min: 0.001 }, { id: 'depth', label: `Height (${rectanglePlaneAxes(p.axis)[1]})`, value: '0', unit: p.unitSystem === 'imperial' ? 'in' : 'mm', min: 0.001 }] });
      p.onToolError(`Corner set · ${p.axis.toUpperCase()} plane · X / Y / Z changes plane · choose direction or move pointer · Alt bypasses snapping`);
    };
    const click = (event: MouseEvent) => { if (current.current.activeTool === 'rectangle' || (current.current.activeTool === 'select' && pick(event as PointerEvent))) event.stopImmediatePropagation(); };
    const leave = () => setHover(undefined);
    canvas.addEventListener('pointermove', move, true); canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('click', click, true); canvas.addEventListener('pointerleave', leave);
    return () => { canvas.removeEventListener('pointermove', move, true); canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('click', click, true); canvas.removeEventListener('pointerleave', leave); };
    // Handlers read current props and gesture refs to avoid interrupting a gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, candidates, invalidate]);
  const command = gesture ? result(gesture, props) : undefined;
  const object = command?.type === 'create-loose' ? command.object : undefined;
  const previewWidth = object ? Math.max(...object.geometry.vertices.map(v => v.positionUm[0])) : 0;
  const previewHeight = object ? Math.max(...object.geometry.vertices.map(v => v.positionUm[1])) : 0;
  const guideStart = gesture?.start.map(n => n / 1_000_000) as [number, number, number] | undefined;
  const guideEnd = gesture ? directRectangleEnd(gesture.start, reorientRectangleEnd(gesture.start, gesture.end, gesture.axis, props.axis), props.axis, props.direction) : undefined;
  const planeStart = gesture ? planeCoordinates(gesture.start, props.axis) : undefined;
  const planeEnd = guideEnd ? planeCoordinates(guideEnd, props.axis) : undefined;
  const guidePoints = planeStart && planeEnd && object ? [fromPlane(planeStart[0] + (Math.sign(planeEnd[0] - planeStart[0]) || 1) * previewWidth, planeStart[1], planeStart[2], props.axis), fromPlane(planeStart[0], planeStart[1] + (Math.sign(planeEnd[1] - planeStart[1]) || 1) * previewHeight, planeStart[2], props.axis)].map(point => point.map(n => n / 1_000_000) as [number, number, number]) : [];
  return <>
    {guideStart && guidePoints.map((point, index) => <group key={index}>
      <Line points={[guideStart, point]} color={rectanglePlaneAxes(props.axis)[index] === 'X' ? '#b33b35' : rectanglePlaneAxes(props.axis)[index] === 'Y' ? '#267346' : '#245aab'} lineWidth={2} dashed raycast={() => null} />
    </group>)}
    {marker && <mesh ref={markerRef} position={marker.point} renderOrder={10} raycast={() => null}><planeGeometry args={[1, 1]} /><meshBasicMaterial color={hover ? '#173b56' : '#e6a94e'} depthTest={false} depthWrite={false} /></mesh>}
    {object && <group position={object.pose.positionUm.map(n => n / 1_000_000) as [number, number, number]} quaternion={object.pose.rotation as [number, number, number, number]}><mesh position={[previewWidth / 2_000_000, previewHeight / 2_000_000, 0]} raycast={() => null}><planeGeometry args={[previewWidth / 1_000_000, previewHeight / 1_000_000]} /><meshBasicMaterial color="#e6a94e" side={DoubleSide} transparent opacity={0.3} depthWrite={false} /></mesh><Line points={[...object.geometry.vertices, object.geometry.vertices[0]].map(v => v.positionUm.map(n => n / 1_000_000) as [number, number, number])} color="#173b56" lineWidth={2} raycast={() => null} /></group>}
  </>;
}
