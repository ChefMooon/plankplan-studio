import * as THREE from 'three';
import type { Geometry } from '@/lib/planner/design/schema';
import { umToMeters } from '@/lib/planner/design/geometry';

export function buildModelGeometry(geometry: Geometry): THREE.BufferGeometry {
  const vertices = new Map(geometry.vertices.map(v => [v.id, v.positionUm]));
  const positions: number[] = [];
  for (const face of geometry.faces) {
    const points = face.vertexIds.map(id => vertices.get(id)).filter((p): p is [number, number, number] => !!p);
    if (points.length < 3) continue;
    const vectors = points.map(p => new THREE.Vector3(...p.map(umToMeters) as [number, number, number]));
    const normal = new THREE.Vector3().subVectors(vectors[1], vectors[0]).cross(new THREE.Vector3().subVectors(vectors[2], vectors[0])).normalize();
    const base = vectors[0];
    const axisU = new THREE.Vector3().subVectors(vectors[1], base).normalize();
    const axisV = new THREE.Vector3().crossVectors(normal, axisU).normalize();
    const shape = new THREE.Shape(vectors.map(v => new THREE.Vector2(v.clone().sub(base).dot(axisU), v.clone().sub(base).dot(axisV))));
    const extrusion = geometry.extrusions.find(e => e.faceId === face.id);
    const local = extrusion ? new THREE.ExtrudeGeometry(shape, { depth: Math.abs(umToMeters(extrusion.distanceUm)), bevelEnabled: false }) : new THREE.ShapeGeometry(shape);
    if (extrusion && extrusion.distanceUm < 0) local.translate(0, 0, umToMeters(extrusion.distanceUm));
    const basis = new THREE.Matrix4().makeBasis(axisU, axisV, normal);
    basis.setPosition(base);
    local.applyMatrix4(basis);
    appendTrianglePositions(positions, local);
    local.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.computeVertexNormals();
  return result;
}

/** Append a geometry's triangles in draw order to a non-indexed position list. */
export function appendTrianglePositions(target: number[], geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position) return;

  const appendVertex = (vertexIndex: number) => {
    target.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
  };

  if (index) {
    for (let i = 0; i + 2 < index.count; i += 3) {
      appendVertex(index.getX(i));
      appendVertex(index.getX(i + 1));
      appendVertex(index.getX(i + 2));
    }
    return;
  }

  for (let i = 0; i + 2 < position.count; i += 3) {
    appendVertex(i);
    appendVertex(i + 1);
    appendVertex(i + 2);
  }
}
