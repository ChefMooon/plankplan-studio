import { describe, expect, it } from 'vitest';
import { buildPlanarGesture, createCapturedPlanarSession, createHitCycle } from './planar-gesture';
import { transformLocalPoint } from '@/lib/planner/design/geometry';

describe('captured planar gesture mapping', () => {
  it('keeps exact line length ahead of snapping', () => {
    const result=buildPlanarGesture('line',[1_001,1_001,0],[21_001,21_001,0],true,17_333);
    expect(result.command?.type).toBe('create-loose');
    if(result.command?.type==='create-loose')expect(result.command.object.geometry.vertices[1].positionUm[0]).toBe(17_333);
  });
  it('snaps rectangles to 10 mm while preserving exact width', () => {
    const result=buildPlanarGesture('rectangle',[1_001,2_001,0],[31_001,42_001,0],true,25_000);
    if(result.command?.type!=='create-loose')throw new Error('rectangle expected');
    const positions=result.command.object.geometry.vertices.map(vertex=>vertex.positionUm);
    expect(Math.max(...positions.map(point=>point[0]))).toBe(25_000);
    expect(Math.max(...positions.map(point=>point[1]))).toBe(40_000);
    const { pose, scalePpm } = result.command.object;
    expect(pose.positionUm).toEqual([0,0,40_000]);
    const worldPoints = positions.map(point => transformLocalPoint(point, pose, scalePpm));
    expect(worldPoints.every(point => point[1] === 0)).toBe(true);
    expect(Math.min(...worldPoints.map(point => point[0]))).toBe(0);
    expect(Math.max(...worldPoints.map(point => point[0]))).toBe(25_000);
    expect(Math.min(...worldPoints.map(point => point[2]))).toBe(0);
    expect(Math.max(...worldPoints.map(point => point[2]))).toBe(40_000);
  });
  it('uses independently entered rectangle dimensions in every corner quadrant', () => {
    const corners:[[number,number,number],[number,number,number]][]=[[[100_000,100_000,0],[0,0,0]],[[100_000,100_000,0],[200_000,0,0]],[[100_000,100_000,0],[0,200_000,0]],[[100_000,100_000,0],[200_000,200_000,0]]];
    for(const [start,end] of corners){
      const result=buildPlanarGesture('rectangle',start,end,false,undefined,[75_000,25_000]);
      if(result.command?.type!=='create-loose')throw new Error('rectangle expected');
      const command=result.command;
      const positions=command.object.geometry.vertices.map(vertex=>vertex.positionUm);
      const world=positions.map(point=>transformLocalPoint(point,command.object.pose,[1_000_000,1_000_000,1_000_000]));
      expect(Math.max(...world.map(point=>point[0]))-Math.min(...world.map(point=>point[0]))).toBe(75_000);
      expect(Math.max(...world.map(point=>point[2]))-Math.min(...world.map(point=>point[2]))).toBe(25_000);
      expect(command.object.pose.positionUm[1]).toBe(0);
    }
  });
  it('returns transient measurements with no command or snapping mutation', () => {
    const result=buildPlanarGesture('measure',[0,0,0],[3_000,4_000,0],false);
    expect(result).toEqual({measurementUm:5_000});
  });
  it('clears provisional gestures on lost capture, cancellation, or tool replacement', () => {
    const session=createCapturedPlanarSession<[number,number]>();
    session.begin([2,3]);
    expect(session.active).toBe(true);
    session.cancel();
    expect(session.takeEnd()).toBeUndefined();
    session.begin([5,8]);
    expect(session.takeEnd()).toEqual([5,8]);
    expect(session.active).toBe(false);
  });
  it('cycles overlapping hit candidates only for repeated nearby clicks', () => {
    const cycle=createHitCycle();
    expect(cycle.pick(['front','back','front'],40,50,100)).toBe('front');
    expect(cycle.pick(['front','back'],41,49,300)).toBe('back');
    expect(cycle.pick(['front','back'],41,49,500)).toBe('front');
    expect(cycle.pick(['front','back'],80,50,700)).toBe('front');
  });
});
