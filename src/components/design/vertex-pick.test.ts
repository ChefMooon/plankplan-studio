import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { VertexTarget } from './rectangle-plane';
import { pickVertexTarget } from './vertex-pick';

const rect = { left: 0, top: 0, width: 800, height: 600 };

function cameraLookingAtOrigin() {
  const camera = new PerspectiveCamera(45, 800 / 600, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe('pickVertexTarget', () => {
  const candidate: VertexTarget = { objectId: 'part', id: 'origin', point: [0, 0, 0], localPoint: [0, 0, 0] };

  it('picks a point at the cursor centre but not 40 pixels away', () => {
    const camera = cameraLookingAtOrigin();
    expect(pickVertexTarget([candidate], camera, rect, 400, 300)).toBe(candidate);
    expect(pickVertexTarget([candidate], camera, rect, 440, 300)).toBeUndefined();
  });

  it('honours eligibility and skips points behind the camera', () => {
    const camera = cameraLookingAtOrigin();
    expect(pickVertexTarget([candidate], camera, rect, 400, 300, () => false)).toBeUndefined();
    const behind: VertexTarget = { objectId: 'part', id: 'behind', point: [0, 0, 10] };
    expect(pickVertexTarget([behind], camera, rect, 400, 300)).toBeUndefined();
  });
});
