import type { Geometry, Vec3Um } from './schema';
import { validateGeometryTopology } from './geometry';

export const PROFILE_SNAP_TOLERANCE_UM = 8_000;

const orientation = (a: Vec3Um, b: Vec3Um, c: Vec3Um) => BigInt(b[0] - a[0]) * BigInt(c[1] - a[1]) - BigInt(b[1] - a[1]) * BigInt(c[0] - a[0]);
function segmentsIntersect(a: Vec3Um, b: Vec3Um, c: Vec3Um, d: Vec3Um) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  const on = (p: Vec3Um, q: Vec3Um, r: Vec3Um) => orientation(p, q, r) === 0n && r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) && r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1]);
  return (o1 > 0n && o2 < 0n || o1 < 0n && o2 > 0n) && (o3 > 0n && o4 < 0n || o3 < 0n && o4 > 0n) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

/** Append one segment to a single open planar chain, snapping to its endpoints and closing it when valid. */
export function appendProfileSegment(geometry: Geometry, start: Vec3Um, end: Vec3Um, ids: { vertex: string; edge: string; face: string }): Geometry {
  const fail = (reason: string): never => { throw new Error(`profile-${reason}`); };
  if (geometry.faces.length || geometry.extrusions.length) fail('not-open-profile');
  const vertices = new Map(geometry.vertices.map(vertex => [vertex.id, vertex]));
  const edges = geometry.edges;
  if (!edges.length) fail('empty-profile');
  const degree = new Map<string, number>();
  for (const edge of edges) for (const id of edge.vertexIds) degree.set(id, (degree.get(id) ?? 0) + 1);
  if ([...degree.values()].some(value => value > 2)) fail('branched-profile');
  const terminals = [...degree].filter(([, value]) => value === 1).map(([id]) => id);
  if (terminals.length !== 2 || [...degree.values()].some(value => value !== 1 && value !== 2)) fail('single-open-chain-required');
  const nearest = (point: Vec3Um, candidates: string[]) => {
    const matches = candidates.map(id => ({ id, point: vertices.get(id)!.positionUm })).map(item => ({ ...item, distance: Math.hypot(item.point[0] - point[0], item.point[1] - point[1], item.point[2] - point[2]) })).filter(item => item.distance <= PROFILE_SNAP_TOLERANCE_UM).sort((a, b) => a.distance - b.distance);
    if (matches.length > 1 && Math.abs(matches[0].distance - matches[1].distance) < 1) fail('ambiguous-snap');
    return matches[0];
  };
  const startMatch = nearest(start, terminals);
  if (!startMatch) fail('start-must-snap-to-endpoint');
  const startId = startMatch.id;
  const snappedStart = vertices.get(startId)!.positionUm;
  const endMatch = nearest(end, [...degree.keys()]);
  let endId: string;
  let nextVertices = [...geometry.vertices];
  if (endMatch) {
    endId = endMatch.id;
    if (degree.get(endId) !== 1 || endId === startId) fail('end-must-snap-to-opposite-endpoint');
  } else {
    if (Math.hypot(end[0] - snappedStart[0], end[1] - snappedStart[1]) < PROFILE_SNAP_TOLERANCE_UM) fail('segment-too-short');
    endId = ids.vertex;
    nextVertices = [...nextVertices, { id: endId, positionUm: end }];
  }
  if (snappedStart[2] !== endMatch?.point[2] && endMatch || !endMatch && end[2] !== snappedStart[2]) fail('nonplanar-segment');
  const nextEdges = [...edges, { id: ids.edge, vertexIds: [startId, endId] as [string, string] }];
  const endPoint = endMatch?.point ?? end;
  for (const edge of edges) {
    if (edge.vertexIds.includes(startId) || edge.vertexIds.includes(endId)) continue;
    const first = vertices.get(edge.vertexIds[0])!.positionUm, second = vertices.get(edge.vertexIds[1])!.positionUm;
    if (first[2] === snappedStart[2] && second[2] === endPoint[2] && segmentsIntersect(snappedStart, endPoint, first, second)) fail('segment-crossing');
  }
  const base: Geometry = { ...geometry, vertices: nextVertices, edges: nextEdges };
  if (!endMatch) {
    const errors = validateGeometryTopology(base);
    if (errors.length) fail(`invalid:${errors[0]}`);
    return base;
  }
  const path: string[] = [startId];
  let current = startId, previousEdge: string | undefined;
  while (current !== endId) {
    const edge = nextEdges.find(candidate => candidate.id !== previousEdge && candidate.vertexIds.includes(current));
    if (!edge) throw new Error('profile-disconnected-chain');
    const next = edge.vertexIds[0] === current ? edge.vertexIds[1] : edge.vertexIds[0];
    path.push(next); previousEdge = edge.id; current = next;
    if (path.length > nextVertices.length + 1) fail('invalid-chain');
  }
  const face: Geometry['faces'][number] = { id: ids.face, vertexIds: path };
  const closed: Geometry = { ...base, faces: [...geometry.faces, face] };
  const errors = validateGeometryTopology(closed);
  if (errors.length) fail(`invalid:${errors[0]}`);
  return closed;
}
