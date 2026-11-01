import * as THREE from 'three';
import type { Pose } from '@/lib/planner/design/schema';
import { DESIGN_LIMIT_UM } from '@/lib/planner/design/geometry';
import type { AxisMode, RotationAxis } from './transform-pivot';

export type MoveAxis = RotationAxis;
export type MoveAxisHit = { axis: MoveAxis; sign: -1 | 1; screenDirection: [number, number] };

const axisNames: MoveAxis[] = ['x', 'y', 'z'];
const unitAxis = (axis: MoveAxis) => new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);

export function resolveMoveConstraint(explicit?: MoveAxis | null, handle?: MoveAxis, shift?: MoveAxis): MoveAxis | undefined {
  if (explicit === null) return shift;
  return explicit ?? handle ?? shift;
}

export function moveAxisDirection(axis: MoveAxis, pose: Pose, mode: AxisMode): THREE.Vector3 {
  const direction = unitAxis(axis);
  if (mode === 'local') direction.applyQuaternion(new THREE.Quaternion(...pose.rotation));
  return direction.normalize();
}

export function projectedMoveAxes(
  camera: THREE.Camera,
  center: THREE.Vector3,
  width: number,
  height: number,
  pose: Pose,
  mode: AxisMode,
  minimumPixels = 8,
  axisLengthWorld = 1,
): Map<MoveAxis, [number, number]> {
  const axes = new Map<MoveAxis, [number, number]>();
  const origin = center.clone().project(camera);
  for (const axis of axisNames) {
    const tip = center.clone().addScaledVector(moveAxisDirection(axis, pose, mode), axisLengthWorld).project(camera);
    if (origin.z < -1 || origin.z > 1 || tip.z < -1 || tip.z > 1) continue;
    const dx = (tip.x - origin.x) * width / 2;
    const dy = -(tip.y - origin.y) * height / 2;
    const length = Math.hypot(dx, dy);
    if (Number.isFinite(length) && length >= minimumPixels) axes.set(axis, [dx / length, dy / length]);
  }
  return axes;
}

export function pickProjectedMoveAxis(
  axes: ReadonlyMap<MoveAxis, [number, number]>,
  dragX: number,
  dragY: number,
  minimumDragPixels = 4,
  minimumAlignment = 0.65,
): MoveAxisHit | undefined {
  const dragLength = Math.hypot(dragX, dragY);
  if (!Number.isFinite(dragLength) || dragLength < minimumDragPixels) return undefined;
  const direction: [number, number] = [dragX / dragLength, dragY / dragLength];
  let best: MoveAxisHit | undefined;
  let bestAlignment = minimumAlignment;
  for (const axis of axisNames) {
    const screenDirection = axes.get(axis);
    if (!screenDirection) continue;
    const dot = direction[0] * screenDirection[0] + direction[1] * screenDirection[1];
    const alignment = Math.abs(dot);
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      best = { axis, sign: dot < 0 ? -1 : 1, screenDirection };
    }
  }
  return best;
}

/** Return the closest axis coordinate to a pointer ray, or undefined when the axis is camera-aligned. */
export function rayAxisCoordinate(
  ray: THREE.Ray,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  minimumDenominator = 0.04,
): number | undefined {
  const direction = axis.clone().normalize();
  const b = direction.dot(ray.direction);
  const denominator = 1 - b * b;
  if (!Number.isFinite(denominator) || denominator < minimumDenominator) return undefined;
  const offset = ray.origin.clone().sub(center);
  const coordinate = (direction.dot(offset) - b * ray.direction.dot(offset)) / denominator;
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

export function rayAtClientPoint(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): THREE.Ray | undefined {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return undefined;
  const pointer = new THREE.Vector2(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray;
}

export function previewMoveOnAxis(
  pose: Pose,
  axis: MoveAxis,
  signedCoordinateUm: number,
  mode: AxisMode,
  snap: boolean,
  exactDistanceUm?: number,
  exactDirection?: -1 | 1,
) {
  const direction = moveAxisDirection(axis, pose, mode);
  const coordinate = exactDistanceUm === undefined
    ? signedCoordinateUm
    : (exactDirection ?? (Math.sign(signedCoordinateUm || 1) as -1 | 1)) * Math.abs(exactDistanceUm);
  const snapped = exactDistanceUm === undefined && snap
    ? Math.round(coordinate / 10_000) * 10_000
    : coordinate;
  const worldDelta = direction.multiplyScalar(snapped);
  const positionUm = pose.positionUm.map((value, index) => {
    const rounded = Math.round(value + worldDelta.getComponent(index));
    return Object.is(rounded, -0) ? 0 : rounded;
  }) as Pose['positionUm'];
  const valid = Number.isFinite(snapped)
    && positionUm.every(value => Number.isSafeInteger(value) && Math.abs(value) <= DESIGN_LIMIT_UM);
  return {
    pose: valid ? { ...pose, positionUm } : pose,
    distanceUm: Math.abs(snapped),
    valid,
  };
}
