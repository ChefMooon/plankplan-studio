import type * as THREE from 'three';

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
