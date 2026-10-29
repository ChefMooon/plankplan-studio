import { describe, expect, it } from 'vitest';
import { rectangleGeometry } from '@/lib/planner/design/geometry';
import { isPushPullEndFace, rectangularPushPullFace, shouldShowPushPullFaceIndicator } from './push-pull';

describe('Push/Pull face eligibility', () => {
  it('allows the source face and end cap while rejecting a side face', () => {
    const geometry = rectangleGeometry(100_000, 80_000, prefix => `${prefix}-${Math.random()}`, 20_000);
    const faceId = geometry.faces[0].id;
    expect(isPushPullEndFace(geometry, faceId, [0.04, 0.04, 0])).toBe(true);
    expect(isPushPullEndFace(geometry, faceId, [0.04, 0.04, 0.02])).toBe(true);
    expect(isPushPullEndFace(geometry, faceId, [0.04, 0, 0.01])).toBe(false);
  });

  it('shows the face indicator for complete shapes whenever Push/Pull is active', () => {
    const complete = rectangleGeometry(100_000, 80_000, prefix => `${prefix}-complete`, 20_000);
    let id = 0;
    const incomplete = rectangleGeometry(100_000, 80_000, prefix => `${prefix}-${id++}`);
    expect(shouldShowPushPullFaceIndicator(complete, undefined, 'push-pull')).toBe(true);
    expect(shouldShowPushPullFaceIndicator(incomplete, undefined, 'push-pull')).toBe(true);
    expect(shouldShowPushPullFaceIndicator(complete, 'confirmed', 'push-pull')).toBe(true);
    expect(shouldShowPushPullFaceIndicator(complete, undefined, 'select')).toBe(false);
    expect(shouldShowPushPullFaceIndicator(incomplete, 'confirmed', 'push-pull')).toBe(true);
  });
});

describe('generated rectangular face indicators', () => {
  const makeRectangle=(depth:number)=>{let id=0;const geometry=rectangleGeometry(100_000,80_000,prefix=>`${prefix}-${id++}`,depth?Math.abs(depth):undefined);if(depth<0)geometry.extrusions[0].distanceUm=depth;return geometry;};
  it('resolves all six faces including both generated end caps', () => {
    const geometry=makeRectangle(20_000);
    expect(rectangularPushPullFace(geometry,[0,0.04,0.01],[-1,0,0])).toEqual({axis:'x',side:-1});
    expect(rectangularPushPullFace(geometry,[0.1,0.04,0.01],[1,0,0])).toEqual({axis:'x',side:1});
    expect(rectangularPushPullFace(geometry,[0.04,0,0.01],[0,-1,0])).toEqual({axis:'y',side:-1});
    expect(rectangularPushPullFace(geometry,[0.04,0.08,0.01],[0,1,0])).toEqual({axis:'y',side:1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0],[0,0,-1])).toEqual({axis:'z',side:-1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0.02],[0,0,1])).toEqual({axis:'z',side:1});
  });
  it('resolves negative extrusions and rejects flat or off-surface hits', () => {
    const geometry=makeRectangle(-20_000);
    expect(rectangularPushPullFace(geometry,[0.04,0.04,-0.02],[0,0,-1])).toEqual({axis:'z',side:-1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0],[0,0,1])).toEqual({axis:'z',side:1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0.01],[0,0,1])).toBeUndefined();
    expect(rectangularPushPullFace(makeRectangle(0),[0.04,0.04,0],[0,0,1])).toEqual({axis:'z',side:1});
    expect(rectangularPushPullFace(makeRectangle(0),[0.04,0.04,0],[0,0,-1])).toEqual({axis:'z',side:-1});
  });
  it('resolves source and cap by hit position even when the face normal points through the back', () => {
    const geometry=makeRectangle(20_000);
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0],[0,0,1])).toEqual({axis:'z',side:-1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0],[0,0,-1])).toEqual({axis:'z',side:-1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0.02],[0,0,1])).toEqual({axis:'z',side:1});
    expect(rectangularPushPullFace(geometry,[0.04,0.04,0.02],[0,0,-1])).toEqual({axis:'z',side:1});
  });
});
