import { describe, expect, it } from 'vitest';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { isPushPullEndFace } from './push-pull';

describe('Push/Pull face eligibility', () => {
  it('allows the source face and end cap while rejecting a side face', () => {
    const geometry = rectangleGeometry(100_000, 80_000, prefix => `${prefix}-${Math.random()}`, 20_000);
    const faceId = geometry.faces[0].id;
    expect(isPushPullEndFace(geometry, faceId, [0.04, 0.04, 0])).toBe(true);
    expect(isPushPullEndFace(geometry, faceId, [0.04, 0.04, 0.02])).toBe(true);
    expect(isPushPullEndFace(geometry, faceId, [0.04, 0, 0.01])).toBe(false);
  });
});
