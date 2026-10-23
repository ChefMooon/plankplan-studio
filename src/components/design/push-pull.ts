import type { Geometry } from '@/lib/planner/design/schema';
import { umToMeters } from '@/lib/planner/design/geometry';

/** Only the source face or its derived end cap may drive a simple extrusion. */
export function isPushPullEndFace(geometry: Geometry, faceId: string, point: readonly [number, number, number], toleranceM = 0.001): boolean {
  const face = geometry.faces.find(candidate => candidate.id === faceId);
  if (!face) return false;
  const vertices = new Map(geometry.vertices.map(vertex => [vertex.id, vertex.positionUm.map(umToMeters) as [number, number, number]]));
  const points = face.vertexIds.map(id => vertices.get(id));
  if (points.length < 3 || points.some(vertex => !vertex)) return false;
  const [a, b, c] = points as [number, number, number][];
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const magnitude = Math.hypot(...normal);
  if (!magnitude) return false;
  const offset = normal.reduce((sum, value, index) => sum + value * (point[index] - a[index]), 0) / magnitude;
  const extrusion = geometry.extrusions.find(candidate => candidate.faceId === faceId);
  return Math.abs(offset) <= toleranceM || !!extrusion && Math.abs(offset - umToMeters(extrusion.distanceUm)) <= toleranceM;
}
