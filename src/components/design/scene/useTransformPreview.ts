import { useCallback } from 'react';
import type * as THREE from 'three';
import { metersToUm, transformLocalPoint, umToMeters } from '@/lib/planner/design/geometry';
import type { Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import { parseMeasurement, previewMove, previewRotate, previewScale } from '../tool-measurements';
import { moveAxisDirection, previewMoveOnAxis, resolveMoveConstraint } from '../move-gesture';
import type { Props } from './DesignScene';
import type { TransformGesture } from './useTransformInteractions';

type PreviewOptions = Pick<Props,'toolMeasurement'|'axisMode'|'moveConstraint'|'snap'|'pivotMode'|'unitSystem'> & {rotationPivotFor:(target:Instance|LooseObject,geometry:Geometry)=>[number,number,number]};

function movePreview(gesture:TransformGesture,end:THREE.Vector3,typed:number|undefined,{axisMode,moveConstraint,snap,unitSystem}:PreviewOptions) {
  const {target}=gesture;
      const raw:[number,number,number]=[metersToUm(end.x-gesture.start.x),metersToUm(end.y-gesture.start.y),metersToUm(end.z-gesture.start.z)];
      const exact=typed===undefined?undefined:Math.round(typed*(unitSystem==='imperial'?25_400:1_000));
      const constrainedAxis=resolveMoveConstraint(moveConstraint,gesture.moveAxis,gesture.moveShiftAxis);
      if(constrainedAxis){
        const direction=moveAxisDirection(constrainedAxis,target.pose,axisMode).toArray() as [number,number,number];
        const coordinate=Math.round(raw[0]*direction[0]+raw[1]*direction[1]+raw[2]*direction[2]);
        const preview=previewMoveOnAxis(target.pose,constrainedAxis,coordinate,axisMode,snap,exact,gesture.moveAxisSigns?.[constrainedAxis]);
        return {pose:preview.pose,scalePpm:target.scalePpm,display:(unitSystem==='imperial'?preview.distanceUm/25_400:preview.distanceUm/1_000).toFixed(unitSystem==='imperial'?3:1),valid:preview.valid&&(preview.distanceUm>0||exact!==undefined&&exact!==0)};
      }else{
        const preview=previewMove(target.pose,raw,axisMode,snap,exact);
        return {pose:preview.pose,scalePpm:target.scalePpm,display:(unitSystem==='imperial'?preview.distanceUm/25_400:preview.distanceUm/1_000).toFixed(unitSystem==='imperial'?3:1),valid:preview.valid&&preview.distanceUm>0};
      }
}

function rotationPreview(gesture:TransformGesture,typed:number|undefined,{toolMeasurement,snap,rotationPivotFor}:PreviewOptions) {
  const {target,geometry,centerLocal}=gesture;
      const rawDegrees=typed??gesture.rotationBaseDegrees;const degrees=typed??(snap?Math.round(rawDegrees/15)*15:rawDegrees);const axis=toolMeasurement?.id===gesture.sessionId?toolMeasurement.rotationAxis:gesture.rotationAxis;const display=degrees.toFixed(2);const valid=!!axis&&Number.isFinite(degrees)&&Math.abs(degrees)>0;
      return {pose:previewRotate(target.pose,target.scalePpm,centerLocal,axis?degrees:0,axis??'z',rotationPivotFor(target,geometry)).pose,scalePpm:target.scalePpm,display,valid};
}

function scalePreview(gesture:TransformGesture,end:THREE.Vector3,typed:number|undefined,{pivotMode}:PreviewOptions) {
  const {target,centerLocal}=gesture;
      const center=transformLocalPoint(centerLocal,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];const startRadius=Math.hypot(gesture.start.x-center[0],gesture.start.y-center[1]);const endRadius=Math.hypot(end.x-center[0],end.y-center[1]);const factor=typed??(startRadius>1e-6?endRadius/startRadius:0);const display=`${factor.toFixed(3)}×`;
      const preview=previewScale(target.pose,target.scalePpm,centerLocal,factor,pivotMode);return {pose:preview.pose,scalePpm:preview.scalePpm,display,valid:preview.valid};
}

export function useTransformPreview({transformGesture,toolMeasurement,axisMode,moveConstraint,snap,pivotMode,unitSystem,rotationPivotFor}:PreviewOptions & {transformGesture?:TransformGesture}) {
  const transformResult=useCallback((gesture=transformGesture,end=gesture?.end)=>{
    if(!gesture||!end)return undefined;
    const {target,geometry,mode}=gesture;const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const typed=field?.exact?parseMeasurement(field.value):undefined;const exactInvalid=!!field?.exact&&(typed===undefined||mode==='move'&&typed<=0);
    const options={toolMeasurement,axisMode,moveConstraint,snap,pivotMode,unitSystem,rotationPivotFor};
    const result=mode==='move'?movePreview(gesture,end,typed,options):mode==='rotate'?rotationPreview(gesture,typed,options):scalePreview(gesture,end,typed,options);
    return {...result,valid:result.valid&&!exactInvalid,geometry,target};
  },[transformGesture,toolMeasurement,axisMode,moveConstraint,snap,pivotMode,unitSystem,rotationPivotFor]);
  return transformResult;
}
