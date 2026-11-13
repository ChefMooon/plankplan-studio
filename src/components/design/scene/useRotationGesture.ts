import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import { transformLocalPoint, umToMeters } from '@/lib/planner/design/geometry';
import { parseMeasurement } from '../tool-measurements';
import type { RotationAxis } from '../transform-pivot';
import type { Props } from './DesignScene';
import type { TransformGesture, useTransformInteractions } from './useTransformInteractions';

function pointerOnAxisPlane(camera:THREE.Camera,canvas:HTMLCanvasElement,center:THREE.Vector3,axis:RotationAxis,clientX:number,clientY:number):THREE.Vector3|undefined {
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return undefined;
  const pointer=new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
  const axisVector=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);
  const raycaster=new THREE.Raycaster();raycaster.setFromCamera(pointer,camera);
  const intersection=raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(axisVector,center),new THREE.Vector3());
  return intersection&&intersection.distanceToSquared(center)>1e-10?intersection:undefined;
}

export function useRotationGesture({transformGesture,transformGestureRef,setTransformGesture,rotationTarget,rotationGeometry,startTransformSession,rotationPivotFor,camera,canvas,toolMeasurement,onToolMeasurementChange,onToolError,transformResult,snap,commitTransform}:Pick<Props,'toolMeasurement'|'onToolMeasurementChange'|'onToolError'|'snap'> & {transformGesture?:TransformGesture;transformGestureRef:RefObject<TransformGesture|undefined>;setTransformGesture:Dispatch<SetStateAction<TransformGesture|undefined>>;rotationTarget?:Instance|LooseObject;rotationGeometry?:Geometry;startTransformSession:(target:Instance|LooseObject,geometry:Geometry,start:THREE.Vector3,mode:'rotate',id:string,axis?:RotationAxis)=>TransformGesture;rotationPivotFor:(target:Instance|LooseObject,geometry:Geometry)=>[number,number,number];camera:THREE.Camera;canvas:HTMLCanvasElement;transformResult:ReturnType<typeof useTransformInteractions>['transformResult'];commitTransform:ReturnType<typeof useTransformInteractions>['commitTransform']}) {
  useEffect(()=>{
    const gesture=transformGestureRef.current;
    if(gesture?.mode!=='rotate'||!gesture.rotationDragging||gesture.rotationLastClientX===undefined)return;
    const centerUm=transformLocalPoint(rotationPivotFor(gesture.target,gesture.geometry),gesture.target.pose,gesture.target.scalePpm);
    const center=new THREE.Vector3(...centerUm.map(umToMeters) as [number,number,number]);
    const clientY=gesture.rotationDragStartClient?.[1]??0;
    const point=pointerOnAxisPlane(camera,canvas,center,gesture.rotationAxis??'z',gesture.rotationLastClientX,clientY);
    setTransformGesture(current=>current?.sessionId===gesture.sessionId?{...current,rotationLastVector:point?.toArray() as [number,number,number]|undefined,rotationDragStartClient:[gesture.rotationLastClientX!,clientY],rotationHadPreviewAtStart:false}:current);
    // Pivot changes invalidate the previous pointer vector; rebase the ongoing drag at its current screen point.
  },[rotationPivotFor,camera,canvas,setTransformGesture,transformGestureRef]);
  const startRotationRingDrag=(axis:RotationAxis,event:ThreeEvent<PointerEvent>)=>{
    if(event.button!==0)return;
    const gesture=transformGesture?.mode==='rotate'?transformGesture:rotationTarget&&rotationGeometry?startTransformSession(rotationTarget,rotationGeometry,event.point,'rotate',`rotate-${rotationTarget.id}-${globalThis.crypto.randomUUID()}`,axis):undefined;
    if(!gesture)return;
    event.stopPropagation();event.nativeEvent.preventDefault();(event.target as unknown as {setPointerCapture?:(id:number)=>void}).setPointerCapture?.(event.pointerId);
    const centerUm=transformLocalPoint(rotationPivotFor(gesture.target,gesture.geometry),gesture.target.pose,gesture.target.scalePpm);
    const center=new THREE.Vector3(...centerUm.map(umToMeters) as [number,number,number]);
    const pointer=pointerOnAxisPlane(camera,canvas,center,axis,event.nativeEvent.clientX,event.nativeEvent.clientY);
    const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const exact=field?.exact?parseMeasurement(field.value):undefined;
    const baseDegrees=exact??(field?Number(field.value):gesture.rotationBaseDegrees);
    const safeBase=Number.isFinite(baseDegrees)?baseDegrees:gesture.rotationBaseDegrees;
    const next={...gesture,rotationAxis:axis,rotationDragging:true,rotationPointerId:event.pointerId,rotationLastVector:pointer?.toArray() as [number,number,number]|undefined,rotationLastClientX:event.nativeEvent.clientX,rotationDragStartClient:[event.nativeEvent.clientX,event.nativeEvent.clientY] as [number,number],rotationHadPreviewAtStart:Math.abs(safeBase)>0,rotationBaseDegrees:safeBase};
    setTransformGesture(next);
    if(toolMeasurement?.id===gesture.sessionId){const value=safeBase.toFixed(2);onToolMeasurementChange({...toolMeasurement,rotationAxis:axis,fields:toolMeasurement.fields.map(current=>({...current,value,exact:false,error:undefined})),canPlace:Math.abs(safeBase)>0});}
    onToolError(`Rotating around ${axis.toUpperCase()} · drag the ring and release to place`);
  };
  // Ring drags rotate around the selected workspace axis using ray intersections with its plane.
  useEffect(()=>{
    if(transformGesture?.mode!=='rotate'||!transformGesture.rotationDragging||!transformGesture.rotationAxis)return;
    const move=(event:PointerEvent)=>{
      if(event.pointerId!==transformGesture.rotationPointerId)return;
      const axis=transformGesture.rotationAxis!;
      const centerUm=transformLocalPoint(rotationPivotFor(transformGesture.target,transformGesture.geometry),transformGesture.target.pose,transformGesture.target.scalePpm);
      const center=new THREE.Vector3(...centerUm.map(umToMeters) as [number,number,number]);
      const point=pointerOnAxisPlane(camera,canvas,center,axis,event.clientX,event.clientY);
      const last=transformGesture.rotationLastVector?new THREE.Vector3(...transformGesture.rotationLastVector):undefined;
      let deltaDegrees=0;let nextVector=last;
      if(point&&last){const next=point.clone().sub(center).normalize();const previous=last.clone().sub(center).normalize();const axisVector=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);const signedAngle=Math.atan2(axisVector.dot(previous.clone().cross(next)),THREE.MathUtils.clamp(previous.dot(next),-1,1));deltaDegrees=signedAngle*180/Math.PI;nextVector=point;}
      else if(transformGesture.rotationLastClientX!==undefined)deltaDegrees=(event.clientX-transformGesture.rotationLastClientX)*0.9;
      const baseDegrees=transformGesture.rotationBaseDegrees+deltaDegrees;
      const updated={...transformGesture,rotationBaseDegrees:baseDegrees,rotationLastVector:nextVector?.toArray() as [number,number,number]|undefined,rotationLastClientX:event.clientX};
      transformGestureRef.current=updated;setTransformGesture(updated);
      const result=transformResult(updated);
      if(result&&toolMeasurement?.id===updated.sessionId&&!toolMeasurement.fields[0]?.exact){const field=toolMeasurement.fields[0];const value=snap?(Math.round(baseDegrees/15)*15).toFixed(2):result.display;onToolMeasurementChange({...toolMeasurement,fields:[{...field,value}],canPlace:result.valid});}
    };
    const end=(event:PointerEvent)=>{const current=transformGestureRef.current;if(!current||event.pointerId!==current.rotationPointerId)return;const stopped={...current,rotationDragging:false,rotationPointerId:undefined,rotationLastVector:undefined,rotationLastClientX:undefined,rotationDragStartClient:undefined,rotationHadPreviewAtStart:undefined};transformGestureRef.current=stopped;setTransformGesture(stopped);if(event.type==='pointerup'&&transformResult(stopped)?.valid)commitTransform(stopped);};
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[canvas,camera,transformGesture,toolMeasurement,onToolMeasurementChange,transformResult,snap,commitTransform,rotationPivotFor,setTransformGesture,transformGestureRef]);
  return startRotationRingDrag;
}
