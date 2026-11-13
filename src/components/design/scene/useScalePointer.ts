import type { Dispatch, SetStateAction } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Props } from './DesignScene';
import type { TransformGesture, useTransformInteractions } from './useTransformInteractions';

export function useScalePointer({transformGesture,setTransformGesture,transformResult,toolMeasurement,onToolMeasurementChange}:Pick<Props,'toolMeasurement'|'onToolMeasurementChange'> & {transformGesture?:TransformGesture;setTransformGesture:Dispatch<SetStateAction<TransformGesture|undefined>>;transformResult:ReturnType<typeof useTransformInteractions>['transformResult']}) {
  return (event:ThreeEvent<PointerEvent>)=>{
    // Move and rotation gestures are driven by their window pointer listeners.
    if(!transformGesture||transformGesture.mode==='rotate'||transformGesture.mode==='move')return;const end=event.point.clone();const updated={...transformGesture,end};setTransformGesture(updated);
    const result=transformResult(updated,end);if(!result)return;
    if(toolMeasurement?.id===updated.sessionId){const field=toolMeasurement.fields[0];if(!field.exact){const value=updated.mode==='scale'?result.display.replace('×',''):result.display;onToolMeasurementChange({...toolMeasurement,fields:[{...field,value}],canPlace:result.valid});}}
  };
}
