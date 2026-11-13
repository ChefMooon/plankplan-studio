import type { Geometry, Pose, ScalePpm } from '@/lib/planner/design/schema';
import { transformLocalPoint } from '@/lib/planner/design/geometry';

export type PivotMode = 'origin' | 'center';
export type RotationPivotMode = 'center' | 'vertex' | 'origin';
export type AxisMode = 'world' | 'local';
export type RotationAxis = 'x' | 'y' | 'z';
export function rotationGizmoRadiusPixels(mode:RotationPivotMode,furthestCornerPixels=0):number {
  return mode==='origin'?Math.max(34,furthestCornerPixels+12):34;
}

/** Local-space bounds including extruded copies; extrusions run along the face normal, as the mesh builder does. */
export function geometryBounds(geometry: Geometry): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const include = (p: readonly number[]) => { for (let i = 0; i < 3; i += 1) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); } };
  const byId = new Map(geometry.vertices.map(v => [v.id, v.positionUm]));
  for (const { positionUm } of geometry.vertices) include(positionUm);
  for (const extrusion of geometry.extrusions) {
    const face = geometry.faces.find(item => item.id === extrusion.faceId);
    const points = face?.vertexIds.map(id => byId.get(id)).filter((p): p is [number, number, number] => !!p) ?? [];
    if (points.length < 3) continue;
    const [a, b, c] = points;
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(n[0], n[1], n[2]);
    if (!length) continue;
    for (const p of points) include([p[0]+n[0]/length*extrusion.distanceUm, p[1]+n[1]/length*extrusion.distanceUm, p[2]+n[2]/length*extrusion.distanceUm]);
  }
  return min[0] === Infinity ? { min: [0, 0, 0], max: [0, 0, 0] } : { min, max };
}

export function geometryCenter(geometry: Geometry): [number, number, number] {
  const { min, max } = geometryBounds(geometry);
  return [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2];
}

/** Local-space +X/+Y/+Z bounding-box corner, so positive axis arrows point away from the shape. */
export function geometryMaxCorner(geometry: Geometry): [number, number, number] {
  return geometryBounds(geometry).max;
}

export function resolveRotationPivotLocal(geometry: Geometry, mode: RotationPivotMode, vertexLocal?: readonly [number,number,number], centerOverride?: readonly [number,number,number]): [number,number,number] {
  if(mode==='origin')return [0,0,0];
  if(mode==='vertex'&&vertexLocal)return [...vertexLocal];
  return centerOverride?[...centerOverride]:geometryCenter(geometry);
}

/** Reposition after rotation/scaling to keep the selected center fixed in world space. */
export function keepGeometryCenter(center: readonly [number, number, number], oldPose: Pose, oldScale: ScalePpm, nextPose: Pose, nextScale: ScalePpm, pivot: PivotMode): Pose {
  if (pivot === 'origin') return nextPose;
  const worldCenter = transformLocalPoint([...center] as [number, number, number], oldPose, oldScale);
  const offset = transformLocalPoint([...center] as [number, number, number], { ...nextPose, positionUm: [0, 0, 0] }, nextScale);
  return { ...nextPose, positionUm: worldCenter.map((value, i) => value - offset[i]) as [number, number, number] };
}

/** Reposition a transformed object so an arbitrary local pivot remains fixed in world space. */
export function keepLocalPoint(pivotLocal: readonly [number, number, number], oldPose: Pose, oldScale: ScalePpm, nextPose: Pose, nextScale: ScalePpm): Pose {
  const worldPoint = transformLocalPoint([...pivotLocal] as [number, number, number], oldPose, oldScale);
  const nextOffset = transformLocalPoint([...pivotLocal] as [number, number, number], { ...nextPose, positionUm: [0, 0, 0] }, nextScale);
  return { ...nextPose, positionUm: worldPoint.map((value, index) => value - nextOffset[index]) as [number, number, number] };
}

/** Rotates a translation delta into the selected local frame without changing its magnitude. */
export function localizeDelta(delta: readonly [number, number, number], pose: Pose, axis: AxisMode): [number, number, number] {
  if (axis === 'world') return [...delta];
  const [x, y, z, w] = pose.rotation;
  const [vx, vy, vz] = delta;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx];
}

export function worldToLocalDelta(delta: readonly [number, number, number], pose: Pose): [number, number, number] {
  const [x, y, z, w] = pose.rotation;
  const inverse = { ...pose, rotation: [-x, -y, -z, w] as Pose['rotation'] };
  return localizeDelta(delta, inverse, 'local');
}

export function rotateAroundAxis(rotation: Pose['rotation'], angle: number, axis: AxisMode): Pose['rotation'] {
  const [x, y, z, w] = rotation;
  const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
  return axis === 'local'
    ? [x*c-y*s, x*s+y*c, z*c+w*s, w*c-z*s]
    : [c*x-s*y, c*y+s*x, c*z-s*w, c*w+s*z];
}

/** Apply a right-handed workspace-axis rotation before the object's current orientation. */
export function rotateAroundWorkspaceAxis(rotation: Pose['rotation'], angle: number, axis: RotationAxis): Pose['rotation'] {
  const half = angle / 2, s = Math.sin(half), c = Math.cos(half);
  const qAxis: Pose['rotation'] = axis === 'x' ? [s, 0, 0, c] : axis === 'y' ? [0, s, 0, c] : [0, 0, s, c];
  const [x, y, z, w] = qAxis, [a, b, d, e] = rotation;
  return [w*a + x*e + y*d - z*b, w*b - x*d + y*e + z*a, w*d + x*b - y*a + z*e, w*e - x*a - y*b - z*d];
}
