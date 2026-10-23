import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { appendTrianglePositions } from './mesh-geometry';

describe('appendTrianglePositions', () => {
  it('preserves indexed rectangle triangulation when flattening a shape', () => {
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(2, 0),
      new THREE.Vector2(2, 1),
      new THREE.Vector2(0, 1),
    ]);
    const geometry = new THREE.ShapeGeometry(shape);
    const positions: number[] = [];

    appendTrianglePositions(positions, geometry);

    expect(positions).toHaveLength(18);
    const triangleArea = (a: number, b: number, c: number) => {
      const ax = positions[a * 3], ay = positions[a * 3 + 1];
      const bx = positions[b * 3], by = positions[b * 3 + 1];
      const cx = positions[c * 3], cy = positions[c * 3 + 1];
      return Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    };
    expect(triangleArea(0, 1, 2) + triangleArea(3, 4, 5)).toBeCloseTo(2);
  });
});
