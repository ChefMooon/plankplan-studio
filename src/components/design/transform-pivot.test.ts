import { describe, expect, it } from 'vitest';
import { rectangleGeometry, transformLocalPoint } from '@/lib/planner/design/geometry';
import { previewRotate } from './tool-measurements';
import { geometryCenter, keepGeometryCenter, keepLocalPoint, localizeDelta, resolveRotationPivotLocal, rotateAroundAxis, rotateAroundWorkspaceAxis, rotationGizmoRadiusPixels } from './transform-pivot';

describe('transform pivot and local axis helpers', () => {
  it('finds the geometry center and preserves it when scaling around center', () => {
    const geometry = rectangleGeometry(100, 60, p => p, 20);
    const center = geometryCenter(geometry);
    expect(center).toEqual([50, 30, 10]);
    const oldPose = { positionUm: [10, 20, 30] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };
    const oldScale: [number, number, number] = [1_000_000, 1_000_000, 1_000_000];
    const newScale: [number, number, number] = [2_000_000, 2_000_000, 2_000_000];
    const nextPose = keepGeometryCenter(center, oldPose, oldScale, oldPose, newScale, 'center');
    expect(transformLocalPoint(center, nextPose, newScale)).toEqual(transformLocalPoint(center, oldPose, oldScale));
  });
  it('maps deltas to local axes and composes the selected rotation axis', () => {
    const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number];
    const pose = { positionUm: [0, 0, 0] as [number, number, number], rotation: quarterTurn };
    expect(localizeDelta([10, 0, 0], pose, 'local')[0]).toBeCloseTo(0);
    expect(localizeDelta([10, 0, 0], pose, 'local')[1]).toBeCloseTo(10);
    expect(rotateAroundAxis(quarterTurn, Math.PI / 2, 'local')).not.toEqual(rotateAroundAxis(quarterTurn, Math.PI / 2, 'world'));
  });
  it('composes right-handed workspace X, Y, and Z rotations independently of object orientation', () => {
    const identity=[0,0,0,1] as [number,number,number,number];
    const quarter=Math.PI/2;
    const x=rotateAroundWorkspaceAxis(identity,quarter,'x');const y=rotateAroundWorkspaceAxis(identity,quarter,'y');const z=rotateAroundWorkspaceAxis(identity,quarter,'z');
    expect(x[0]).toBeCloseTo(Math.SQRT1_2);expect(x[3]).toBeCloseTo(Math.SQRT1_2);
    expect(y[1]).toBeCloseTo(Math.SQRT1_2);expect(y[3]).toBeCloseTo(Math.SQRT1_2);
    expect(z[2]).toBeCloseTo(Math.SQRT1_2);expect(z[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it('applies workspace rotations before an existing object rotation', () => {
    const quarterTurnZ=[0,0,Math.SQRT1_2,Math.SQRT1_2] as [number,number,number,number];
    const rotatedAroundWorkspaceX=rotateAroundWorkspaceAxis(quarterTurnZ,Math.PI/2,'x');
    expect(rotatedAroundWorkspaceX[0]).toBeCloseTo(0.5);
    expect(rotatedAroundWorkspaceX[1]).toBeCloseTo(-0.5);
    expect(rotatedAroundWorkspaceX[2]).toBeCloseTo(0.5);
    expect(rotatedAroundWorkspaceX[3]).toBeCloseTo(0.5);
    expect(rotateAroundWorkspaceAxis([0,0,0,1],-Math.PI/2,'y')[1]).toBeCloseTo(-Math.SQRT1_2);
  });

  it('keeps the geometry center fixed during workspace-axis rotation with nonuniform scale', () => {
    const geometry=rectangleGeometry(100,60,p=>p,20);const center=geometryCenter(geometry);
    const pose={positionUm:[12,34,56] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]};
    const scale:[number,number,number]=[2_000_000,750_000,1_250_000];
    const rotated=previewRotate(pose,scale,center,37,'x','center');
    expect(transformLocalPoint(center,rotated.pose,scale)).toEqual(transformLocalPoint(center,pose,scale));
  });
  it('resolves center, origin, and picked-vertex pivots with a safe center fallback', () => {
    const geometry=rectangleGeometry(100,60,p=>p,20);
    expect(resolveRotationPivotLocal(geometry,'center')).toEqual([50,30,10]);
    expect(resolveRotationPivotLocal(geometry,'center',undefined,[0,0,0])).toEqual([0,0,0]);
    expect(resolveRotationPivotLocal(geometry,'origin')).toEqual([0,0,0]);
    expect(resolveRotationPivotLocal(geometry,'vertex',[100,60,20])).toEqual([100,60,20]);
    expect(resolveRotationPivotLocal(geometry,'vertex')).toEqual([50,30,10]);
  });
  it('keeps Center and Vertex gizmos compact while Origin encloses the projected object corners', () => {
    expect(rotationGizmoRadiusPixels('center',120)).toBe(34);
    expect(rotationGizmoRadiusPixels('vertex',120)).toBe(34);
    expect(rotationGizmoRadiusPixels('origin',120)).toBe(132);
    expect(rotationGizmoRadiusPixels('origin',10)).toBe(34);
  });
  it('keeps an arbitrary picked corner fixed through preview and commit poses with nonuniform object scale', () => {
    const geometry=rectangleGeometry(100_000,60_000,p=>p,20_000);
    const corner:[number,number,number]=[100_000,60_000,20_000];
    const pose={positionUm:[240_000,-35_000,18_000] as [number,number,number],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2] as [number,number,number,number]};
    const scale:[number,number,number]=[2_000_000,750_000,1_250_000];
    const before=transformLocalPoint(corner,pose,scale);
    const preview=previewRotate(pose,scale,geometryCenter(geometry),123,'y',corner);
    expect(transformLocalPoint(corner,preview.pose,scale)).toEqual(before);
    expect(keepLocalPoint(corner,pose,scale,preview.pose,scale).positionUm).toEqual(preview.pose.positionUm);
  });
});
