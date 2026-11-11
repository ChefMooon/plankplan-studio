import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Camera } from 'three';
import type { DesignDocumentV1, Vec3Um } from '@/lib/planner/design/schema';
import { roundSignedUm, umToMeters } from '@/lib/planner/design/geometry';
import type { AnnotationAnchor, AnnotationTarget } from '@/lib/planner/design/annotations';
import { boxEdgeEndpointsLocalUm, boxEdgeId, boxFaceCornersLocalUm, boxFaceId, findPartFrame, isConfirmedBox, localToWorldUm, worldUmToLocalUm } from './annotation-anchor';
import { resolveSubElement } from './sub-selection';
import { pickVertexTarget } from './vertex-pick';
import type { VertexTarget } from './rectangle-plane';

export const EDGE_SNAP_TOLERANCE_PX = 8;

export type AnchorHighlight = { kind: 'point' | 'edge' | 'face'; pointsWorldM: [number, number, number][] };
export type AnchorHover = { anchor: AnnotationAnchor; highlight: AnchorHighlight };
export type SurfaceHit = { objectId: string; localPointM: [number, number, number]; localNormal?: [number, number, number] };

type Rect = { left: number; top: number; width: number; height: number };
type ScreenPoint = { x: number; y: number; z: number };

function screenPoint(point: readonly number[], camera: Camera, rect: Rect): ScreenPoint {
  const projected = new Vector3(...point as [number, number, number]).project(camera);
  return {
    x: rect.left + (projected.x + 1) * rect.width / 2,
    y: rect.top + (1 - projected.y) * rect.height / 2,
    z: projected.z,
  };
}

function eligibleTarget(design: DesignDocumentV1, objectId: string): AnnotationTarget | undefined {
  if (design.instances.some(item => item.id === objectId)) return { kind: 'instance', id: objectId };
  if (design.looseObjects.some(item => item.id === objectId)) return { kind: 'loose', id: objectId };
  return undefined;
}

function roundedLerp(a: Vec3Um, b: Vec3Um, t: number): Vec3Um {
  return a.map((value, index) => roundSignedUm(value + (b[index] - value) * t)) as Vec3Um;
}

function pixelSegmentDistance(point: { x: number; y: number }, a: ScreenPoint, b: ScreenPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
  return { distance: Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)), t };
}

function worldMeters(local: Vec3Um, frame: NonNullable<ReturnType<typeof findPartFrame>>): [number, number, number] | undefined {
  const world = localToWorldUm(local, frame);
  return world?.map(umToMeters) as [number, number, number] | undefined;
}

export function pickAnnotationAnchor(args: {
  design: DesignDocumentV1;
  candidates: VertexTarget[];
  camera: Camera;
  rect: Rect;
  clientX: number;
  clientY: number;
  hit?: SurfaceHit;
  vertexOnly?: boolean;
}): AnchorHover | undefined {
  const { design, candidates, camera, rect, clientX, clientY, hit } = args;
  const eligible = (target: VertexTarget) => !!eligibleTarget(design, target.objectId);
  const vertex = pickVertexTarget(candidates, camera, rect, clientX, clientY, eligible);
  if (vertex) {
    const target = eligibleTarget(design, vertex.objectId)!;
    const frame = findPartFrame(design, target);
    if (!frame) return undefined;
    const worldUm = vertex.point.map(value => roundSignedUm(value * 1_000_000)) as Vec3Um;
    const localUm = vertex.localPoint ? vertex.localPoint.map(roundSignedUm) as Vec3Um : worldUmToLocalUm(worldUm, frame);
    return { anchor: { target, element: { type: 'vertex', id: vertex.id }, localUm }, highlight: { kind: 'point', pointsWorldM: [vertex.point] } };
  }
  if (args.vertexOnly || !hit) return undefined;

  const target = eligibleTarget(design, hit.objectId);
  const frame = target && findPartFrame(design, target);
  if (!target || !frame) return undefined;

  if (isConfirmedBox(frame.cutSpec) && frame.cutSpec) {
    const cutSpec = frame.cutSpec;
    const edgeCandidates: { id: string; start: Vec3Um; end: Vec3Um }[] = [];
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const s1 of ['m', 'p'] as const) for (const s2 of ['m', 'p'] as const) {
        const [start, end] = boxEdgeEndpointsLocalUm(cutSpec, axis, s1, s2);
        edgeCandidates.push({ id: boxEdgeId(axis, s1, s2), start, end });
      }
    }
    const cursor = { x: clientX, y: clientY };
    let best: { id: string; start: Vec3Um; end: Vec3Um; t: number; distance: number; worldStart: [number, number, number]; worldEnd: [number, number, number] } | undefined;
    for (const edge of edgeCandidates) {
      const worldStart = worldMeters(edge.start, frame), worldEnd = worldMeters(edge.end, frame);
      if (!worldStart || !worldEnd) continue;
      const a = screenPoint(worldStart, camera, rect), b = screenPoint(worldEnd, camera, rect);
      if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) continue;
      const { distance, t } = pixelSegmentDistance(cursor, a, b);
      if (distance <= EDGE_SNAP_TOLERANCE_PX && (!best || distance < best.distance)) best = { ...edge, t, distance, worldStart, worldEnd };
    }
    if (best) {
      const edgeTPpm = Math.max(0, Math.min(1_000_000, Math.round(best.t * 1_000_000)));
      return {
        anchor: { target, element: { type: 'edge', id: best.id, edgeTPpm }, localUm: roundedLerp(best.start, best.end, edgeTPpm / 1_000_000) },
        highlight: { kind: 'edge', pointsWorldM: [best.worldStart, best.worldEnd] },
      };
    }
  } else {
    const cursor = { x: clientX, y: clientY };
    let best: { id: string; start: Vec3Um; end: Vec3Um; t: number; distance: number; worldStart: [number, number, number]; worldEnd: [number, number, number] } | undefined;
    for (const edge of frame.geometry.edges) {
      const start = frame.geometry.vertices.find(vertex => vertex.id === edge.vertexIds[0])?.positionUm;
      const end = frame.geometry.vertices.find(vertex => vertex.id === edge.vertexIds[1])?.positionUm;
      if (!start || !end) continue;
      const worldStart = worldMeters(start, frame), worldEnd = worldMeters(end, frame);
      if (!worldStart || !worldEnd) continue;
      const a = screenPoint(worldStart, camera, rect), b = screenPoint(worldEnd, camera, rect);
      if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) continue;
      const { distance, t } = pixelSegmentDistance(cursor, a, b);
      if (distance <= EDGE_SNAP_TOLERANCE_PX && (!best || distance < best.distance)) best = { id: edge.id, start, end, t, distance, worldStart, worldEnd };
    }
    if (best) {
      const edgeTPpm = Math.max(0, Math.min(1_000_000, Math.round(best.t * 1_000_000)));
      return {
        anchor: { target, element: { type: 'edge', id: best.id, edgeTPpm }, localUm: roundedLerp(best.start, best.end, edgeTPpm / 1_000_000) },
        highlight: { kind: 'edge', pointsWorldM: [best.worldStart, best.worldEnd] },
      };
    }
  }

  const hitLocalUm = hit.localPointM.map(value => roundSignedUm(value * 1_000_000)) as Vec3Um;
  if (isConfirmedBox(frame.cutSpec) && frame.cutSpec && hit.localNormal) {
    const normal = hit.localNormal;
    const axisIndex = normal.reduce((bestIndex, value, index) => Math.abs(value) > Math.abs(normal[bestIndex]) ? index : bestIndex, 0);
    const axis = 'xyz'[axisIndex] as 'x' | 'y' | 'z';
    const side = (normal[axisIndex] < 0 ? 'm' : 'p') as 'm' | 'p';
    const localCorners = boxFaceCornersLocalUm(frame.cutSpec, axis, side);
    const pointsWorldM = localCorners.map(point => worldMeters(point, frame)).filter((point): point is [number, number, number] => !!point);
    return { anchor: { target, element: { type: 'face', id: boxFaceId(axis, side) }, localUm: hitLocalUm }, highlight: { kind: 'face', pointsWorldM } };
  }

  const subElement = resolveSubElement(frame.geometry, hit.localPointM, 0);
  if (subElement?.type !== 'face') return undefined;
  const face = frame.geometry.faces.find(item => item.id === subElement.id);
  const pointsWorldM = face?.vertexIds.flatMap(id => {
    const vertex = frame.geometry.vertices.find(item => item.id === id);
    const point = vertex && worldMeters(vertex.positionUm, frame);
    return point ? [point] : [];
  }) ?? [];
  return { anchor: { target, element: { type: 'face', id: subElement.id }, localUm: hitLocalUm }, highlight: { kind: 'face', pointsWorldM } };
}

export function cursorPointOnCameraPlane(
  camera: Camera,
  rect: Rect,
  clientX: number,
  clientY: number,
  throughWorldM: readonly number[],
): [number, number, number] | undefined {
  if (!rect.width || !rect.height) return undefined;
  const pointer = new Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const normal = camera.getWorldDirection(new Vector3());
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(...throughWorldM as [number, number, number]));
  const intersection = raycaster.ray.intersectPlane(plane, new Vector3());
  return intersection?.toArray() as [number, number, number] | undefined;
}
