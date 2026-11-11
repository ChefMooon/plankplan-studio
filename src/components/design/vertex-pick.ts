import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { VertexTarget } from './rectangle-plane';

export function pickVertexTarget(
  candidates: readonly VertexTarget[],
  camera: Camera,
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  eligible: (target: VertexTarget) => boolean = () => true,
  thresholdPx = 12,
): VertexTarget | undefined {
  let best: VertexTarget | undefined;
  let distance = thresholdPx;
  for (const target of candidates) {
    if (!eligible(target)) continue;
    const projected = new Vector3(...target.point).project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const d = Math.hypot(
      rect.left + (projected.x + 1) * rect.width / 2 - clientX,
      rect.top + (1 - projected.y) * rect.height / 2 - clientY,
    );
    if (d < distance) {
      distance = d;
      best = target;
    }
  }
  return best;
}
