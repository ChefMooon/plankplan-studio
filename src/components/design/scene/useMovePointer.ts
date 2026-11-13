import { useCallback } from 'react';
import * as THREE from 'three';
import type { Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import { moveAxisDirection, pickProjectedMoveAxis, projectedMoveAxes, rayAtClientPoint, rayAxisCoordinate, resolveMoveConstraint } from '../move-gesture';
import type { Props } from './DesignScene';
import type { TransformGesture } from './useTransformInteractions';
import { worldPerPixel } from './transform-screen';

export function useMovePointer({moveShiftHeld,moveConstraint,camera,canvas,viewportSize,axisMode,onToolError,movePivotFor}:Pick<Props,'moveShiftHeld'|'moveConstraint'|'axisMode'|'onToolError'> & {camera:THREE.Camera;canvas:HTMLCanvasElement;viewportSize:{width:number;height:number};movePivotFor:(target:Instance|LooseObject,geometry:Geometry)=>[number,number,number]}) {
  const moveGestureAtPointer=useCallback((gesture:TransformGesture,clientX:number,clientY:number)=>{
    let updated={...gesture,moveLastClient:[clientX,clientY] as [number,number]};
    if(moveShiftHeld&&!moveConstraint&&(!updated.moveAxis||moveConstraint===null)&&!updated.moveShiftAxis&&updated.moveStartClient){
      const pivot=updated.movePivot??movePivotFor(updated.target,updated.geometry);
      const pivotPoint=new THREE.Vector3(...pivot);
      const axes=projectedMoveAxes(camera,pivotPoint,viewportSize.width,viewportSize.height,updated.target.pose,axisMode,8,worldPerPixel(camera,pivotPoint,viewportSize.height)*42);
      const hit=pickProjectedMoveAxis(axes,clientX-updated.moveStartClient[0],clientY-updated.moveStartClient[1]);
      if(hit)updated={...updated,moveShiftAxis:hit.axis,moveAxisSigns:{...updated.moveAxisSigns,[hit.axis]:hit.sign}};
    }else if(!moveShiftHeld&&updated.moveShiftAxis)updated={...updated,moveShiftAxis:undefined};
    const axis=resolveMoveConstraint(moveConstraint,updated.moveAxis,updated.moveShiftAxis);
    if(axis){
      const pivot=updated.movePivot??movePivotFor(updated.target,updated.geometry);
      const origin=new THREE.Vector3(...pivot);
      const direction=moveAxisDirection(axis,updated.target.pose,axisMode);
      const from=updated.moveStartClient??[clientX,clientY];
      const startRay=rayAtClientPoint(camera,canvas,from[0],from[1]);
      const currentRay=rayAtClientPoint(camera,canvas,clientX,clientY);
      const startCoordinate=updated.moveAxis===axis&&updated.moveStartAxisCoordinate!==undefined
        ? updated.moveStartAxisCoordinate
        : startRay&&rayAxisCoordinate(startRay,origin,direction);
      const currentCoordinate=currentRay&&rayAxisCoordinate(currentRay,origin,direction);
      if(startCoordinate===undefined||currentCoordinate===undefined){
        onToolError(`${axis.toUpperCase()} axis is too close to the camera direction to move; orbit the view or choose another axis`);
        return undefined;
      }
      updated={...updated,moveStartAxisCoordinate:startCoordinate,movePivot:pivot};
      const signedCoordinate=currentCoordinate-startCoordinate;
      if(Math.abs(signedCoordinate)>1e-8)updated.moveAxisSigns={...updated.moveAxisSigns,[axis]:Math.sign(signedCoordinate) as -1|1};
      const delta=direction.multiplyScalar(signedCoordinate);
      updated.end=updated.start.clone().add(delta);
    }else{
      const ray=rayAtClientPoint(camera,canvas,clientX,clientY);
      const freePoint=ray?.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-gesture.start.z),new THREE.Vector3());
      if(freePoint){
        if(gesture.moveFromHandle&&gesture.moveStartClient){
          const startRay=rayAtClientPoint(camera,canvas,...gesture.moveStartClient);
          const startPlane=new THREE.Plane(new THREE.Vector3(0,0,1),-gesture.start.z);
          const freeStart=startRay?.intersectPlane(startPlane,new THREE.Vector3());
          if(freeStart)updated.end=gesture.start.clone().add(freePoint.clone().sub(freeStart));
        }else updated.end=freePoint.clone();
      }
      updated.moveAxis=undefined;
      updated.moveStartAxisCoordinate=undefined;
    }
    return updated;
  },[moveShiftHeld,moveConstraint,camera,canvas,viewportSize,axisMode,onToolError,movePivotFor]);
  return moveGestureAtPointer;
}
