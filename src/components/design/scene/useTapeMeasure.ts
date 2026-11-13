import { useState, type RefObject } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { UnitSystem } from '@/lib/planner/model';
import { parseMeasurement, type ToolMeasurementSession } from '../tool-measurements';

type Options = { activeTool: string; unitSystem: UnitSystem; toolMeasurement?: ToolMeasurementSession; onToolMeasurementChange: (session?: ToolMeasurementSession) => void; onRegisterMeasurementActions: (actions?: {commit:()=>void;cancel:()=>void}) => void; onMeasure: (value?: number) => void; onToolError: (message: string) => void; completedSessions: RefObject<Set<string>> };

export function useTapeMeasure({activeTool,unitSystem,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions,onMeasure,onToolError,completedSessions}: Options) {
  const [measureGesture,setMeasureGesture]=useState<{start:THREE.Vector3;end:THREE.Vector3;sessionId:string}>();
  const measureValue=(gesture=measureGesture)=>{
    if(!gesture)return 0;
    const field=toolMeasurement?.id===gesture.sessionId?toolMeasurement.fields[0]:undefined;
    const typed=field?.exact?parseMeasurement(field.value,0.001):undefined;
    if(field?.exact&&typed===undefined)return 0;
    return typed!==undefined?Math.round(typed*(unitSystem==='imperial'?25_400:1_000)):Math.round(gesture.start.distanceTo(gesture.end)*1_000_000);
  };
  const commitMeasure=(gesture=measureGesture)=>{
    if(!gesture||completedSessions.current.has(gesture.sessionId))return;completedSessions.current.add(gesture.sessionId);const value=measureValue(gesture);if(value>0)onMeasure(value);
    setMeasureGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError(value>0?'Measurement captured · temporary only':'Enter a positive distance');
  };
  const cancelMeasure=()=>{setMeasureGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError('Measurement canceled');};
  const placeMeasurePoint=(event:ThreeEvent<PointerEvent>)=>{
    const point=event.point.clone();if(!measureGesture){const id=`measure-${Date.now()}`;setMeasureGesture({start:point,end:point,sessionId:id});onToolMeasurementChange({id,tool:'Tape Measure',canPlace:false,fields:[{id:'distance',label:'Length',value:'0',unit:unitSystem === 'imperial' ? 'in' : 'mm',min:0.001}]});onToolError('Measurement start set · move to preview or enter a distance');return;}
    commitMeasure({...measureGesture,end:point});
  };
  const updateMeasurePointer=(event:ThreeEvent<PointerEvent>)=>{
    if(!measureGesture)return;const end=event.point.clone();setMeasureGesture(current=>current?{...current,end}:current);
    if(toolMeasurement?.id===measureGesture.sessionId){const field=toolMeasurement.fields[0];if(!field.exact){const value=Math.round(measureGesture.start.distanceTo(end)*1_000_000);onToolMeasurementChange({...toolMeasurement,fields:[{...field,value:(unitSystem==='imperial'?value/25_400:value/1_000).toFixed(unitSystem==='imperial'?3:1)}],canPlace:value>0});}}
  };
  const measurePreview=(()=>{
    if(activeTool!=='measure'||!measureGesture)return undefined;
    const start=measureGesture.start.clone();const direction=measureGesture.end.clone().sub(start);if(direction.lengthSq()<1e-12)direction.set(1,0,0);else direction.normalize();
    const end=start.clone().addScaledVector(direction,measureValue()/1_000_000);
    return {start:start.toArray() as [number,number,number],end:end.toArray() as [number,number,number]};
  })();
  return { measureGesture, commitMeasure, cancelMeasure, placeMeasurePoint, updateMeasurePointer, measurePreview };
}
