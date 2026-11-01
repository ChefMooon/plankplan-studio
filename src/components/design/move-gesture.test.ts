import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { previewMoveOnAxis, projectedMoveAxes, pickProjectedMoveAxis, rayAxisCoordinate, resolveMoveConstraint } from './move-gesture';

const pose = { positionUm: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };

describe('3D move gesture math', () => {
  it('gives explicit constraints priority over Shift and retains a handle axis', () => {
    expect(resolveMoveConstraint('y','x','z')).toBe('y');
    expect(resolveMoveConstraint(undefined,'x','z')).toBe('x');
    expect(resolveMoveConstraint(undefined,undefined,'z')).toBe('z');
    expect(resolveMoveConstraint()).toBeUndefined();
  });

  it('projects only screen-visible axes and picks the nearest projected direction deterministically', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const axes = projectedMoveAxes(camera, new THREE.Vector3(), 800, 600, pose, 'world');

    expect(axes.has('x')).toBe(true);
    expect(axes.has('y')).toBe(true);
    expect(axes.has('z')).toBe(false);
    expect(pickProjectedMoveAxis(axes, 20, 1)?.axis).toBe('x');
    expect(pickProjectedMoveAxis(axes, 20, 1)?.sign).toBe(1);
    expect(pickProjectedMoveAxis(axes, -20, 1)?.sign).toBe(-1);
    expect(pickProjectedMoveAxis(new Map([['x', [1, 0]], ['y', [1, 0]]] as const), 20, 0)?.axis).toBe('x');
    expect(pickProjectedMoveAxis(axes, 2, 0)).toBeUndefined();
  });

  it('computes a ray-to-axis coordinate and rejects a camera-aligned axis', () => {
    const ray = new THREE.Ray(new THREE.Vector3(3, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(rayAxisCoordinate(ray, new THREE.Vector3(), new THREE.Vector3(1, 0, 0))).toBeCloseTo(3);
    expect(rayAxisCoordinate(ray, new THREE.Vector3(), new THREE.Vector3(0, 0, 1))).toBeUndefined();
  });

  it('snaps after constraining to one axis, exact distance overrides snap, and zero displacement defaults positive', () => {
    expect(previewMoveOnAxis(pose, 'z', -14_000, 'world', true).pose.positionUm).toEqual([0, 0, -10_000]);
    expect(previewMoveOnAxis(pose, 'y', -14_000, 'world', true, 25_001).pose.positionUm).toEqual([0, -25_001, 0]);
    expect(previewMoveOnAxis(pose, 'x', 0, 'world', true, 12_345).pose.positionUm).toEqual([12_345, 0, 0]);
    expect(previewMoveOnAxis(pose, 'z', 0, 'world', true, 12_345, -1).pose.positionUm).toEqual([0, 0, -12_345]);
  });

  it('uses the rotated local axis direction without applying object scale', () => {
    const rotated = { ...pose, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number, number] };
    expect(previewMoveOnAxis(rotated, 'x', 20_000, 'local', false).pose.positionUm).toEqual([0, 0, -20_000]);
  });

  it('rejects fractional, non-finite, and out-of-bounds destination coordinates', () => {
    expect(previewMoveOnAxis({ ...pose, positionUm: [1_000_000_000, 0, 0] }, 'x', 1, 'world', false).valid).toBe(false);
    expect(previewMoveOnAxis({ ...pose, positionUm: [0, 0, 0] }, 'x', Number.NaN, 'world', false).valid).toBe(false);
  });
});
