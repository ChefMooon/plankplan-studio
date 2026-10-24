import { Quaternion, Vector3 } from 'three';
import type { DesignDocumentV1, Geometry } from '@/lib/planner/design/schema';
import { rectangleGeometry, umToMeters } from '@/lib/planner/design/geometry';
import type { DesignCommand } from '@/lib/planner/design/commands';

export type RectangleAxis = 'x' | 'y' | 'z';
export type RectangleDirection = 'pointer' | '++' | '-+' | '+-' | '--';
export const rectanglePlaneAxes = (axis: RectangleAxis) => axis === 'x' ? ['Z', 'Y'] : axis === 'y' ? ['X', 'Z'] : ['X', 'Y'];
/** Preserve the anchor and the two in-plane dimensions when changing planes. */
export function reorientRectangleEnd(start: readonly number[], end: readonly number[], from: RectangleAxis, to: RectangleAxis): [number, number, number] {
  const a = planeCoordinates(start, from), b = planeCoordinates(end, from), origin = planeCoordinates(start, to);
  return fromPlane(origin[0] + b[0] - a[0], origin[1] + b[1] - a[1], origin[2], to);
}
export function directRectangleEnd(start: readonly number[], end: readonly number[], axis: RectangleAxis, direction: RectangleDirection): [number, number, number] {
  if (direction === 'pointer') return [...end] as [number, number, number];
  const a = planeCoordinates(start, axis), b = planeCoordinates(end, axis);
  const uSign = direction[0] === '+' ? 1 : -1;
  // The floor plane's second local axis points toward world -Z.
  const vSign = (direction[1] === '+' ? 1 : -1) * (axis === 'y' ? -1 : 1);
  return fromPlane(a[0] + uSign * Math.max(1, Math.abs(b[0] - a[0])), a[1] + vSign * Math.max(1, Math.abs(b[1] - a[1])), a[2], axis);
}
export type VertexTarget = { objectId: string; id: string; point: [number, number, number] };
export function planeCoordinates(point: readonly number[], axis: RectangleAxis): [number, number, number] {
  return axis === 'x' ? [point[2], point[1], point[0]] : axis === 'y' ? [point[0], -point[2], point[1]] : [point[0], point[1], point[2]];
}
export function fromPlane(u: number, v: number, offset: number, axis: RectangleAxis): [number, number, number] {
  return axis === 'x' ? [offset, v, u] : axis === 'y' ? [u, offset, -v] : [u, v, offset];
}
export function rectangleCommand(start: readonly number[], end: readonly number[], axis: RectangleAxis, width?: number, height?: number): DesignCommand | undefined {
  if ([...start, ...end].some(n => !Number.isSafeInteger(n) || Math.abs(n) > 1_000_000_000)) return;
  const a = planeCoordinates(start, axis), b = planeCoordinates(end, axis);
  const w = width ?? Math.abs(b[0] - a[0]), h = height ?? Math.abs(b[1] - a[1]);
  if (![w, h].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000)) return;
  const u = a[0] + (Math.sign(b[0] - a[0]) || 1) * w, v = a[1] + (Math.sign(b[1] - a[1]) || 1) * h;
  if ([u, v].some(n => Math.abs(n) > 1_000_000_000)) return;
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(axis === 'y' ? 1 : 0, axis === 'x' ? 1 : 0, 0), axis === 'z' ? 0 : -Math.PI / 2).toArray() as [number, number, number, number];
  const id = crypto.randomUUID();
  return { type: 'create-loose', object: { id: `rectangle-${id}`, name: 'Rectangle', geometry: rectangleGeometry(w, h, p => `${p}-${crypto.randomUUID()}`), pose: { positionUm: fromPlane(Math.min(a[0], u), Math.min(a[1], v), a[2], axis), rotation }, scalePpm: [1_000_000, 1_000_000, 1_000_000], appearance: { color: '#bd8a56' }, hidden: false, locked: false } };
}
export function geometryCorners(geometry: Geometry): { id: string; point: [number, number, number] }[] {
  const corners = geometry.vertices.map(v => ({ id: v.id, point: v.positionUm }));
  for (const extrusion of geometry.extrusions) {
    const face = geometry.faces.find(f => f.id === extrusion.faceId);
    const vertices = face?.vertexIds.map(id => geometry.vertices.find(v => v.id === id)).filter(v => !!v) ?? [];
    if (vertices.length < 3) continue;
    const a = new Vector3(...vertices[0].positionUm), b = new Vector3(...vertices[1].positionUm), c = new Vector3(...vertices[2].positionUm);
    const normal = b.sub(a).cross(c.sub(a)).normalize().multiplyScalar(extrusion.distanceUm);
    for (const vertex of vertices) corners.push({ id: `${vertex.id}@${extrusion.id}`, point: vertex.positionUm.map((n, i) => Math.round(n + normal.getComponent(i))) as [number, number, number] });
  }
  return corners;
}
export function designVertices(design?: DesignDocumentV1, editingDefinitionId?: string): VertexTarget[] {
  if (!design) return [];
  const result: VertexTarget[] = [];
  const add = (objectId: string, geometry: Geometry, pose: DesignDocumentV1['instances'][number]['pose'], scale: readonly [number, number, number], cutSpec?: DesignDocumentV1['definitions'][number]['cutSpec']) => {
    const corners = cutSpec?.confirmation === 'confirmed' ? [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => ({ id: `corner-${x}-${y}-${z}`, point: [x * cutSpec.lengthUm / 2, y * cutSpec.widthUm / 2, z * cutSpec.thicknessUm / 2] as [number, number, number] })))) : geometryCorners(geometry);
    for (const corner of corners) result.push({ objectId, id: corner.id, point: new Vector3(...corner.point).multiply(new Vector3(...scale.map(n => n / 1_000_000))).applyQuaternion(new Quaternion(...pose.rotation)).add(new Vector3(...pose.positionUm)).toArray().map(n => umToMeters(Math.round(n))) as [number, number, number] });
  };
  for (const item of design.instances.filter(i => !i.hidden && (!editingDefinitionId || i.definitionId === editingDefinitionId))) {
    const def = design.definitions.find(d => d.id === item.definitionId);
    if (def) add(item.id, def.geometry, item.pose, item.scalePpm, def.cutSpec);
  }
  if (!editingDefinitionId) for (const item of design.looseObjects.filter(i => !i.hidden)) add(item.id, item.geometry, item.pose, item.scalePpm);
  design.definitions.filter(d => !design.instances.some(i => i.definitionId === d.id)).forEach((def, index) => {
    if (!editingDefinitionId || editingDefinitionId === def.id) add(def.id, def.geometry, { positionUm: [editingDefinitionId ? 0 : index * 1_500_000, 0, 0], rotation: [0, 0, 0, 1] }, [1_000_000, 1_000_000, 1_000_000], def.cutSpec);
  });
  return result;
}
