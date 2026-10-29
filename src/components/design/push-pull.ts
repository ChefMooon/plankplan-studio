import type { Geometry } from '@/lib/planner/design/schema';
import { rectangularProfileSide, getRectangularProfile, umToMeters } from '@/lib/planner/design/geometry';

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

export function shouldShowPushPullFaceIndicator(geometry:Geometry,confirmation:string|undefined,activeTool:string):boolean {
  const complete=confirmation==='confirmed'||geometry.extrusions.length>0||!!getRectangularProfile(geometry);
  return activeTool==='push-pull'&&complete;
}

/** The generated end caps are not stored faces, so resolve them from the hit normal. */
export function rectangularPushPullFace(geometry:Geometry,point:readonly [number,number,number],normal:readonly [number,number,number]):{axis:'x'|'y'|'z';side:-1|1}|undefined {
  const side=rectangularProfileSide(geometry,point,normal);
  if(side)return side;
  const rect=getRectangularProfile(geometry);
  if(!rect)return;
  if(Math.abs(normal[2])<0.8)return;
  const distance=geometry.extrusions[0]?.distanceUm??0;
  const coordinate=point[2]*1_000_000;
  if(!distance)return Math.abs(coordinate-rect.z)<=2_000?{axis:'z',side:(Math.sign(normal[2])||1) as -1|1}:undefined;
  if(Math.abs(coordinate-rect.z)<=2_000)return{axis:'z',side:(-Math.sign(distance)) as -1|1};
  return Math.abs(coordinate-(rect.z+distance))<=2_000?{axis:'z',side:Math.sign(distance) as -1|1}:undefined;
}
