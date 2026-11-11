import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from '@/lib/planner/design/commands';
import { IDENTITY_POSE, IDENTITY_SCALE, rectangleGeometry, transformLocalPoint } from '@/lib/planner/design/geometry';
import type { Annotation, AnnotationAnchor } from '@/lib/planner/design/annotations';
import type { DesignDocumentV1, Geometry, Vec3Um } from '@/lib/planner/design/schema';
import type { Project } from '@/lib/planner/model';
import { boxEdgeId, boxFaceCornersLocalUm, findPartFrame, isConfirmedBox, localToWorldUm, parseBoxEdgeId, resolveAnchorLocalUm, resolveAnnotation, worldUmToLocalUm } from './annotation-anchor';

const project: Project = { schemaVersion: 3, id: 'p', name: 'Project', unitSystem: 'metric', kerf: { um: 0 }, trim: { um: 0 }, minOffcutLinear: { um: 0 }, minOffcutSheet: { shortSideUm: 0, longSideUm: 0 }, currency: 'CAD', cutlists: [{ id: 'default-cutlist', name: 'Default' }], planningGroups: [], parts: [], materials: [{ id: 'wood', name: 'Wood', type: 'linear', stocks: [] }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', design: { schemaVersion: 1, definitions: [], instances: [], looseObjects: [], partLinks: {} } };
const must = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => { if (!result.ok) throw new Error('command failed'); return result as Extract<T, { ok: true }> };
let geometrySequence = 0;
const makeGeometry = (prefix = 'g', length = 100, width = 80, extrusion = 20): Geometry => rectangleGeometry(length, width, part => `${prefix}-${part}-${geometrySequence++}`, extrusion);
const loose = { id: 'loose-1', name: 'Part', geometry: makeGeometry('loose'), pose: { ...IDENTITY_POSE, positionUm: [500, 600, 700] as Vec3Um }, scalePpm: [...IDENTITY_SCALE] as [number, number, number], appearance: { color: '#aabbcc' }, hidden: false, locked: false };
const withLoose = must(applyDesignCommand(project, { type: 'create-loose', object: loose })).project;
const vertexAnchor = (id = loose.geometry.vertices[0].id, localUm: Vec3Um = [0, 0, 0]): AnnotationAnchor => ({ target: { kind: 'loose', id: 'loose-1' }, element: { type: 'vertex', id }, localUm });
const text: Annotation = { id: 'note', kind: 'text', anchor: vertexAnchor(), text: 'Note', labelLocalUm: [20, 30, 40] };
const dimension: Annotation = { id: 'dimension', kind: 'dimension', start: vertexAnchor(), end: vertexAnchor(loose.geometry.vertices[1].id, [100, 0, 0]), measure: 'direct', offsetUm: [0, 10, 0] };
const designOf = (p: Project) => p.design as DesignDocumentV1;

describe('annotation anchors', () => {
  it('round trips a point through a rotated and scaled part frame', () => {
    const pose = { positionUm: [1_000, -2_000, 3_000] as Vec3Um, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] };
    const frame = { pose, scalePpm: [2_000_000, 1_000_000, 1_000_000] as [number, number, number] };
    const point: Vec3Um = [123, -456, 789];
    expect(worldUmToLocalUm(localToWorldUm(point, frame)!, frame)).toEqual(point);
  });

  it('follows a vertex through move, rotate and scale transforms', () => {
    const annotation = { ...text, anchor: vertexAnchor(loose.geometry.vertices[0].id, loose.geometry.vertices[0].positionUm) };
    const before = resolveAnnotation({ ...designOf(withLoose), annotations: [annotation] }, annotation);
    const moved = must(applyDesignCommand(withLoose, { type: 'set-loose-transform', objectId: loose.id, pose: { positionUm: [8_000, 9_000, 10_000], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, scalePpm: [2_000_000, 1_000_000, 1_000_000] })).project;
    const after = resolveAnnotation({ ...designOf(moved), annotations: [annotation] }, annotation);
    expect(before?.kind).toBe('text');
    expect(after?.kind).toBe('text');
    if (after?.kind === 'text') expect(after.anchorWorldUm).toEqual(transformLocalPoint(loose.geometry.vertices[0].positionUm, moved.design!.looseObjects[0].pose, moved.design!.looseObjects[0].scalePpm));
    expect(after).not.toEqual(before);
  });

  it('tracks a retained vertex id after profile geometry changes', () => {
    const annotation = { ...text, anchor: vertexAnchor(loose.geometry.vertices[2].id, loose.geometry.vertices[2].positionUm) };
    const resizedGeometry = makeGeometry('larger', 300, 80, 20);
    const sameIds = { ...resizedGeometry, vertices: resizedGeometry.vertices.map((vertex, index) => ({ ...vertex, id: loose.geometry.vertices[index].id })), edges: resizedGeometry.edges.map((edge, index) => ({ ...edge, id: loose.geometry.edges[index].id, vertexIds: loose.geometry.edges[index].vertexIds })), faces: resizedGeometry.faces.map((face, index) => ({ ...face, id: loose.geometry.faces[index].id, vertexIds: loose.geometry.faces[index].vertexIds })), extrusions: resizedGeometry.extrusions.map((entry, index) => ({ ...entry, id: loose.geometry.extrusions[index].id, faceId: loose.geometry.extrusions[index].faceId })) };
    const resized = must(applyDesignCommand(withLoose, { type: 'set-loose-geometry', objectId: loose.id, geometry: sameIds })).project;
    const resolved = resolveAnnotation({ ...designOf(resized), annotations: [annotation] }, annotation);
    expect(resolved?.kind === 'text' && resolved.anchorWorldUm).toEqual(transformLocalPoint(sameIds.vertices[2].positionUm, loose.pose, loose.scalePpm));
  });

  it('resolves push-pull synthetic corners live and falls back after extrusion id changes', () => {
    const extrusion = loose.geometry.extrusions[0];
    const syntheticId = `${loose.geometry.faces[0].vertexIds[0]}@${extrusion.id}`;
    const anchor: AnnotationAnchor = { ...vertexAnchor(syntheticId), localUm: [12, 13, 14] };
    const frame = findPartFrame(designOf(withLoose), anchor.target)!;
    const livePoint = resolveAnchorLocalUm(anchor, frame);
    expect(livePoint).not.toEqual(anchor.localUm);
    const changed = { ...loose.geometry, extrusions: loose.geometry.extrusions.map(item => ({ ...item, id: 'changed-extrusion' })) };
    const edited = must(applyDesignCommand(withLoose, { type: 'set-loose-geometry', objectId: loose.id, geometry: changed })).project;
    expect(resolveAnchorLocalUm(anchor, findPartFrame(designOf(edited), anchor.target)!)).toEqual(anchor.localUm);
  });

  it('resolves a non-box edge anchor at its interpolated midpoint', () => {
    const edge = loose.geometry.edges[0];
    const anchor: AnnotationAnchor = { target: { kind: 'loose', id: loose.id }, element: { type: 'edge', id: edge.id, edgeTPpm: 500_000 }, localUm: [0, 0, 0] };
    const frame = findPartFrame(designOf(withLoose), anchor.target)!;
    const a = loose.geometry.vertices.find(vertex => vertex.id === edge.vertexIds[0])!.positionUm;
    const b = loose.geometry.vertices.find(vertex => vertex.id === edge.vertexIds[1])!.positionUm;
    expect(resolveAnchorLocalUm(anchor, frame)).toEqual(a.map((value, index) => Math.round((value + b[index]) / 2)));
  });

  it('resolves confirmed-box corners and faces against live dimensions and round trips edge ids', () => {
    const board = must(applyDesignCommand(project, { type: 'create-board', id: 'board-1', definitionId: 'def-1', name: 'Board', materialId: 'wood', lengthUm: 1_000, widthUm: 600, thicknessUm: 100 })).project;
    const boardDesign = designOf(board), instanceTarget = { kind: 'instance' as const, id: 'board-1' };
    const frame = findPartFrame(boardDesign, instanceTarget)!;
    expect(isConfirmedBox(frame.cutSpec)).toBe(true);
    const corner: AnnotationAnchor = { target: instanceTarget, element: { type: 'vertex', id: 'corner-1-1-1' }, localUm: [0, 0, 0] };
    const face: AnnotationAnchor = { target: instanceTarget, element: { type: 'face', id: 'box-face-zp' }, localUm: [1_000, 200, 0] };
    const annotated = { ...boardDesign, annotations: [{ ...text, anchor: corner }, { ...text, id: 'face', anchor: face }] };
    const resized = must(applyDesignCommand(board, { type: 'set-primitive-dimensions', definitionId: 'def-1', lengthUm: 2_000, widthUm: 600, thicknessUm: 300 })).project;
    const nextFrame = findPartFrame(designOf(resized), instanceTarget)!;
    expect(resolveAnchorLocalUm(corner, nextFrame)).toEqual([1_000, 300, 150]);
    expect(resolveAnchorLocalUm(face, nextFrame)).toEqual([1_000, 200, 150]);
    expect(boxFaceCornersLocalUm(nextFrame.cutSpec!, 'z', 'p')).toEqual([[-1_000, -300, 150], [1_000, -300, 150], [1_000, 300, 150], [-1_000, 300, 150]]);
    void annotated;
    const id = boxEdgeId('y', 'm', 'p');
    expect(parseBoxEdgeId(id)).toEqual({ axis: 'y', s1: 'm', s2: 'p' });
  });

  it('keeps annotation world positions through Make Component', () => {
    const annotated = must(applyDesignCommand(withLoose, { type: 'add-annotation', annotation: text })).project;
    const withDimension = must(applyDesignCommand(annotated, { type: 'add-annotation', annotation: dimension })).project;
    const before = withDimension.design!.annotations!.map(annotation => resolveAnnotation(designOf(withDimension), annotation));
    const made = must(applyDesignCommand(withDimension, { type: 'make-component', objectId: loose.id, definitionId: 'component-def', instanceId: 'component-instance', name: 'Component' })).project;
    const after = made.design!.annotations!.map(annotation => resolveAnnotation(designOf(made), annotation));
    expect(after).toEqual(before);
  });

  it('does not resolve hidden parts or dimensions with a missing part', () => {
    const withText = must(applyDesignCommand(withLoose, { type: 'add-annotation', annotation: text })).project;
    const hidden = must(applyDesignCommand(withText, { type: 'set-state', target: 'loose', id: loose.id, hidden: true })).project;
    expect(resolveAnnotation(designOf(hidden), text)).toBeUndefined();
    const secondLoose = { ...loose, id: 'loose-2' };
    const two = must(applyDesignCommand(withLoose, { type: 'create-loose', object: secondLoose })).project;
    const spanning: Annotation = { ...dimension, start: vertexAnchor(loose.geometry.vertices[0].id), end: { ...vertexAnchor(loose.geometry.vertices[1].id), target: { kind: 'loose', id: 'loose-2' } } };
    expect(resolveAnnotation(designOf(two), spanning)).toBeDefined();
    const missing: DesignDocumentV1 = { ...designOf(two), looseObjects: designOf(two).looseObjects.filter(object => object.id !== 'loose-2') };
    expect(resolveAnnotation(missing, spanning)).toBeUndefined();
  });
});
