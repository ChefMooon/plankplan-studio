import { geometryCorners } from './rectangle-plane';
import { roundSignedUm, transformLocalPoint } from '@/lib/planner/design/geometry';
import type { Annotation, AnnotationAnchor, AnnotationTarget, DimensionMeasure } from '@/lib/planner/design/annotations';
import { dimensionValueUm } from './annotation-dimension';
import type { CutSpec, DesignDocumentV1, Geometry, Pose, ScalePpm, Vec3Um } from '@/lib/planner/design/schema';

export type PartFrame = { geometry: Geometry; cutSpec?: CutSpec; pose: Pose; scalePpm: ScalePpm; hidden: boolean };

export function isConfirmedBox(cutSpec?: CutSpec): boolean {
  return cutSpec?.confirmation === 'confirmed';
}

export function findPartFrame(design: DesignDocumentV1, target: AnnotationTarget): PartFrame | undefined {
  if (target.kind === 'instance') {
    const instance = design.instances.find(item => item.id === target.id);
    const definition = instance && design.definitions.find(item => item.id === instance.definitionId);
    return instance && definition ? { geometry: definition.geometry, cutSpec: definition.cutSpec, pose: instance.pose, scalePpm: instance.scalePpm, hidden: instance.hidden } : undefined;
  }
  const object = design.looseObjects.find(item => item.id === target.id);
  return object ? { geometry: object.geometry, pose: object.pose, scalePpm: object.scalePpm, hidden: object.hidden } : undefined;
}

export function boxCornerLocalUm(cutSpec: CutSpec, sx: -1 | 1, sy: -1 | 1, sz: -1 | 1): Vec3Um {
  return [sx * cutSpec.lengthUm / 2, sy * cutSpec.widthUm / 2, sz * cutSpec.thicknessUm / 2].map(roundSignedUm) as Vec3Um;
}

export function boxEdgeId(axis: 'x' | 'y' | 'z', s1: 'm' | 'p', s2: 'm' | 'p'): string {
  return `box-edge-${axis}:${s1}${s2}`;
}

export function boxFaceId(axis: 'x' | 'y' | 'z', side: 'm' | 'p'): string {
  return `box-face-${axis}${side}`;
}

export function parseCornerId(id: string): [-1 | 1, -1 | 1, -1 | 1] | undefined {
  const match = /^corner-(-1|1)-(-1|1)-(-1|1)$/.exec(id);
  return match ? [Number(match[1]) as -1 | 1, Number(match[2]) as -1 | 1, Number(match[3]) as -1 | 1] : undefined;
}

export function parseBoxEdgeId(id: string): { axis: 'x' | 'y' | 'z'; s1: 'm' | 'p'; s2: 'm' | 'p' } | undefined {
  const match = /^box-edge-([xyz]):([mp])([mp])$/.exec(id);
  return match ? { axis: match[1] as 'x' | 'y' | 'z', s1: match[2] as 'm' | 'p', s2: match[3] as 'm' | 'p' } : undefined;
}

export function parseBoxFaceId(id: string): { axis: 'x' | 'y' | 'z'; side: 'm' | 'p' } | undefined {
  const match = /^box-face-([xyz])([mp])$/.exec(id);
  return match ? { axis: match[1] as 'x' | 'y' | 'z', side: match[2] as 'm' | 'p' } : undefined;
}

const halfDimensions = (cutSpec: CutSpec): Vec3Um => [cutSpec.lengthUm / 2, cutSpec.widthUm / 2, cutSpec.thicknessUm / 2].map(roundSignedUm) as Vec3Um;
const signed = (side: 'm' | 'p'): -1 | 1 => side === 'm' ? -1 : 1;
const lerp = (a: Vec3Um, b: Vec3Um, t: number): Vec3Um => a.map((value, index) => roundSignedUm(value + (b[index] - value) * t)) as Vec3Um;

export function boxEdgeEndpointsLocalUm(cutSpec: CutSpec, axis: 'x' | 'y' | 'z', s1: 'm' | 'p', s2: 'm' | 'p'): [Vec3Um, Vec3Um] {
  const axes = axis === 'x' ? [1, 2] : axis === 'y' ? [0, 2] : [0, 1];
  const start = [0, 0, 0], end = [0, 0, 0];
  start[axes[0]] = end[axes[0]] = signed(s1) * halfDimensions(cutSpec)[axes[0]];
  start[axes[1]] = end[axes[1]] = signed(s2) * halfDimensions(cutSpec)[axes[1]];
  start['xyz'.indexOf(axis)] = -halfDimensions(cutSpec)['xyz'.indexOf(axis)];
  end['xyz'.indexOf(axis)] = halfDimensions(cutSpec)['xyz'.indexOf(axis)];
  return [start as Vec3Um, end as Vec3Um];
}

export function boxFaceCornersLocalUm(cutSpec: CutSpec, axis: 'x' | 'y' | 'z', side: 'm' | 'p'): Vec3Um[] {
  const axisIndex = 'xyz'.indexOf(axis), half = halfDimensions(cutSpec);
  const other = [0, 1, 2].filter(index => index !== axisIndex);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const point = [0, 0, 0];
    point[axisIndex] = signed(side) * half[axisIndex];
    point[other[0]] = a * half[other[0]];
    point[other[1]] = b * half[other[1]];
    return point as Vec3Um;
  });
}

export function resolveAnchorLocalUm(anchor: AnnotationAnchor, frame: Pick<PartFrame, 'geometry' | 'cutSpec'>): Vec3Um {
  const { type, id, edgeTPpm } = anchor.element;
  const remembered = anchor.localUm;
  const cutSpec = frame.cutSpec;
  if (isConfirmedBox(cutSpec) && cutSpec) {
    if (type === 'vertex') {
      const signs = parseCornerId(id);
      return signs ? boxCornerLocalUm(cutSpec, ...signs) : remembered;
    }
    if (type === 'edge') {
      const parsed = parseBoxEdgeId(id);
      if (!parsed || edgeTPpm === undefined) return remembered;
      const [start, end] = boxEdgeEndpointsLocalUm(cutSpec, parsed.axis, parsed.s1, parsed.s2);
      return lerp(start, end, edgeTPpm / 1_000_000);
    }
    const parsed = parseBoxFaceId(id);
    if (!parsed) return remembered;
    const axisIndex = 'xyz'.indexOf(parsed.axis), half = halfDimensions(cutSpec), point = [...remembered];
    point[axisIndex] = signed(parsed.side) * half[axisIndex];
    for (let i = 0; i < 3; i++) if (i !== axisIndex) point[i] = Math.max(-half[i], Math.min(half[i], point[i]));
    return point as Vec3Um;
  }
  if (type === 'vertex') return geometryCorners(frame.geometry).find(corner => corner.id === id)?.point ?? remembered;
  if (type === 'edge') {
    const edge = frame.geometry.edges.find(item => item.id === id);
    if (!edge || edgeTPpm === undefined) return remembered;
    const a = frame.geometry.vertices.find(vertex => vertex.id === edge.vertexIds[0])?.positionUm;
    const b = frame.geometry.vertices.find(vertex => vertex.id === edge.vertexIds[1])?.positionUm;
    return a && b ? lerp(a, b, edgeTPpm / 1_000_000) : remembered;
  }
  return remembered;
}

export function localToWorldUm(local: Vec3Um, frame: Pick<PartFrame, 'pose' | 'scalePpm'>): Vec3Um | undefined {
  try { return transformLocalPoint(local, frame.pose, frame.scalePpm); } catch { return undefined; }
}

export function worldUmToLocalUm(world: Vec3Um, frame: Pick<PartFrame, 'pose' | 'scalePpm'>): Vec3Um {
  const [qx, qy, qz, qw] = frame.pose.rotation;
  const norm = Math.hypot(qx, qy, qz, qw);
  const x = (world[0] - frame.pose.positionUm[0]), y = (world[1] - frame.pose.positionUm[1]), z = (world[2] - frame.pose.positionUm[2]);
  // Rotate by the normalized conjugate quaternion.
  const ax = -qx / norm, ay = -qy / norm, az = -qz / norm, aw = qw / norm;
  const tx = 2 * (ay * z - az * y), ty = 2 * (az * x - ax * z), tz = 2 * (ax * y - ay * x);
  const rotated = [x + aw * tx + ay * tz - az * ty, y + aw * ty + az * tx - ax * tz, z + aw * tz + ax * ty - ay * tx];
  return rotated.map((value, index) => roundSignedUm(value / (frame.scalePpm[index] / 1_000_000))) as Vec3Um;
}

export type ResolvedAnnotation =
  | { id: string; kind: 'text'; anchorWorldUm: Vec3Um; labelWorldUm: Vec3Um }
  | { id: string; kind: 'dimension'; startWorldUm: Vec3Um; endWorldUm: Vec3Um; measure: DimensionMeasure; offsetUm: Vec3Um; valueUm: number };

export function resolveAnnotation(design: DesignDocumentV1, annotation: Annotation): ResolvedAnnotation | undefined {
  if (annotation.kind === 'text') {
    const frame = findPartFrame(design, annotation.anchor.target);
    if (!frame || frame.hidden) return undefined;
    const anchorWorldUm = localToWorldUm(resolveAnchorLocalUm(annotation.anchor, frame), frame);
    const labelWorldUm = localToWorldUm(annotation.labelLocalUm, frame);
    return anchorWorldUm && labelWorldUm ? { id: annotation.id, kind: 'text', anchorWorldUm, labelWorldUm } : undefined;
  }
  const startFrame = findPartFrame(design, annotation.start.target), endFrame = findPartFrame(design, annotation.end.target);
  if (!startFrame || !endFrame || startFrame.hidden || endFrame.hidden) return undefined;
  const startWorldUm = localToWorldUm(resolveAnchorLocalUm(annotation.start, startFrame), startFrame);
  const endWorldUm = localToWorldUm(resolveAnchorLocalUm(annotation.end, endFrame), endFrame);
  return startWorldUm && endWorldUm ? { id: annotation.id, kind: 'dimension', startWorldUm, endWorldUm, measure: annotation.measure, offsetUm: annotation.offsetUm, valueUm: dimensionValueUm(startWorldUm, endWorldUm, annotation.measure) } : undefined;
}

export function resolveAllAnnotations(design?: DesignDocumentV1): ResolvedAnnotation[] {
  return (design?.annotations ?? []).flatMap(annotation => {
    const resolved = resolveAnnotation(design!, annotation);
    return resolved ? [resolved] : [];
  });
}
