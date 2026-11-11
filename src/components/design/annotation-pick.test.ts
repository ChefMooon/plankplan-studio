import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import type { DesignDocumentV1 } from '@/lib/planner/design/schema';
import { designVertices } from './rectangle-plane';
import { pickAnnotationAnchor, cursorPointOnCameraPlane, type SurfaceHit } from './annotation-pick';

const rect = { left: 0, top: 0, width: 800, height: 600 };

function makeCamera() {
  const camera = new PerspectiveCamera(45, 800 / 600, 0.01, 100);
  camera.position.set(0.12, 0.12, 1.1);
  camera.lookAt(0.12, 0.12, 0);
  camera.updateMatrixWorld();
  return camera;
}

function project(camera: PerspectiveCamera, point: readonly number[]) {
  const projected = new Vector3(...point as [number, number, number]).project(camera);
  return { x: (projected.x + 1) * 400, y: (1 - projected.y) * 300 };
}

function looseDesign(): DesignDocumentV1 {
  let nextId = 0;
  return {
    schemaVersion: 1, definitions: [], instances: [], partLinks: {},
    looseObjects: [{ id: 'loose', name: 'Rectangle', geometry: rectangleGeometry(240_000, 240_000, prefix => `${prefix}-${++nextId}`), pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], appearance: { color: '#fff' }, hidden: false, locked: false }],
  };
}

function confirmedDesign(): DesignDocumentV1 {
  const design = looseDesign();
  const geometry = design.looseObjects[0].geometry;
  return {
    schemaVersion: 1, partLinks: {}, looseObjects: [],
    definitions: [{ id: 'definition', name: 'Board', geometry, cutSpec: { kind: 'board', lengthUm: 240_000, widthUm: 180_000, thicknessUm: 30_000, grainAxis: 'length', confirmation: 'confirmed' }, appearance: { color: '#fff' } }],
    instances: [{ id: 'instance', definitionId: 'definition', pose: { positionUm: [0, 0, 0], rotation: [0, 0, 0, 1] }, scalePpm: [1_000_000, 1_000_000, 1_000_000], hidden: false, locked: false }],
  };
}

describe('pickAnnotationAnchor', () => {
  it('picks a loose rectangle corner and records its local point', () => {
    const design = looseDesign(), camera = makeCamera(), candidates = designVertices(design);
    const target = candidates.find(candidate => candidate.id === 'v-1')!;
    const cursor = project(camera, target.point);
    const result = pickAnnotationAnchor({ design, candidates, camera, rect, clientX: cursor.x, clientY: cursor.y });
    expect(result?.anchor).toEqual({ target: { kind: 'loose', id: 'loose' }, element: { type: 'vertex', id: 'v-1' }, localUm: [0, 0, 0] });
    expect(result?.highlight).toEqual({ kind: 'point', pointsWorldM: [target.point] });
  });

  it('snaps to an edge within five pixels away from corners', () => {
    const design = looseDesign(), camera = makeCamera(), candidates = designVertices(design);
    const midpoint: [number, number, number] = [0.12, 0, 0];
    const cursor = project(camera, midpoint);
    const result = pickAnnotationAnchor({ design, candidates, camera, rect, clientX: cursor.x, clientY: cursor.y + 5, hit: { objectId: 'loose', localPointM: [0.12, 0.001, 0] } });
    expect(result?.anchor.element.type).toBe('edge');
    if (result?.anchor.element.type === 'edge') expect(result.anchor.element.edgeTPpm).toBeGreaterThanOrEqual(0);
    if (result?.anchor.element.type === 'edge') expect(result.anchor.element.edgeTPpm).toBeLessThanOrEqual(1_000_000);
  });

  it('picks a face from a surface hit, and vertex-only mode refuses the face centre', () => {
    const design = looseDesign(), camera = makeCamera(), candidates = designVertices(design);
    const hit: SurfaceHit = { objectId: 'loose', localPointM: [0.12, 0.12, 0] };
    const cursor = project(camera, hit.localPointM);
    const args = { design, candidates, camera, rect, clientX: cursor.x, clientY: cursor.y, hit };
    expect(pickAnnotationAnchor(args)?.anchor.element).toEqual({ type: 'face', id: design.looseObjects[0].geometry.faces[0].id });
    expect(pickAnnotationAnchor({ ...args, vertexOnly: true })).toBeUndefined();
  });

  it('uses synthetic confirmed-box corner, edge and face identifiers', () => {
    const design = confirmedDesign(), camera = makeCamera(), candidates = designVertices(design);
    const corner = candidates[0];
    const cornerCursor = project(camera, corner.point);
    expect(pickAnnotationAnchor({ design, candidates, camera, rect, clientX: cornerCursor.x, clientY: cornerCursor.y })?.anchor.element.id).toMatch(/^corner-/);

    const edgePoint: [number, number, number] = [0, 0.09, 0.015];
    const edgeCursor = project(camera, edgePoint);
    const edge = pickAnnotationAnchor({ design, candidates, camera, rect, clientX: edgeCursor.x, clientY: edgeCursor.y + 4, hit: { objectId: 'instance', localPointM: edgePoint } });
    expect(edge?.anchor.element).toMatchObject({ type: 'edge', id: expect.stringMatching(/^box-edge-/) });

    const facePoint: [number, number, number] = [0, 0, 0.015];
    const faceCursor = project(camera, facePoint);
    const face = pickAnnotationAnchor({ design, candidates, camera, rect, clientX: faceCursor.x, clientY: faceCursor.y, hit: { objectId: 'instance', localPointM: facePoint, localNormal: [0, 0, 1] } });
    expect(face?.anchor.element).toEqual({ type: 'face', id: 'box-face-zp' });
  });

  it('intersects the cursor ray with the camera-parallel plane through a point', () => {
    const camera = makeCamera(), through: [number, number, number] = [0.12, 0.12, 0];
    const hit = cursorPointOnCameraPlane(camera, rect, 500, 250, through);
    expect(hit).toBeDefined();
    const forward = camera.getWorldDirection(new Vector3());
    expect(new Vector3(...hit!).sub(new Vector3(...through)).dot(forward)).toBeCloseTo(0, 8);
  });
});
