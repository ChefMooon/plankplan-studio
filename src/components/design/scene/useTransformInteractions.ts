import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Geometry, Instance, LooseObject } from '@/lib/planner/design/schema';
import { umToMeters, transformLocalPoint } from '@/lib/planner/design/geometry';
import { designVertices } from '../rectangle-plane';
import { geometryCenter, resolveRotationPivotLocal, rotationGizmoRadiusPixels, type RotationAxis } from '../transform-pivot';
import { moveAxisDirection, rayAtClientPoint, rayAxisCoordinate, resolveMoveConstraint, type MoveAxis } from '../move-gesture';
import { useMovePointer } from './useMovePointer';
import { useTransformPreview } from './useTransformPreview';
import { useRotationGesture } from './useRotationGesture';
import { worldPerPixel } from './transform-screen';
import { useScalePointer } from './useScalePointer';
import type { Props } from './DesignScene';

export type TransformGesture = {mode:'move'|'rotate'|'scale';start:THREE.Vector3;end:THREE.Vector3;rotationBaseDegrees:number;rotationDragging?:boolean;rotationPointerId?:number;rotationLastVector?:[number,number,number];rotationLastClientX?:number;rotationDragStartClient?:[number,number];rotationHadPreviewAtStart?:boolean;sessionId:string;target:Instance|LooseObject;geometry:Geometry;centerLocal:[number,number,number];rotationAxis?:RotationAxis;moveAxis?:MoveAxis;moveShiftAxis?:MoveAxis;moveAxisSigns?:Partial<Record<MoveAxis,-1|1>>;moveFromHandle?:boolean;moveStartClient?:[number,number];moveLastClient?:[number,number];movePivot?:[number,number,number];moveStartAxisCoordinate?:number;movePointerId?:number};

export function useTransformInteractions({activeTool,snap,unitSystem,pivotMode,rotationPivotMode,axisMode,moveConstraint,moveShiftHeld,onCommand,onToolError,design,selectedId,selectedElement,editingDefinitionId,toolMeasurement,onToolMeasurementChange,onRegisterMeasurementActions,completedSessions}:Pick<Props,'activeTool'|'snap'|'pivotMode'|'rotationPivotMode'|'axisMode'|'moveConstraint'|'moveShiftHeld'|'onCommand'|'onToolError'|'design'|'selectedId'|'selectedElement'|'editingDefinitionId'|'toolMeasurement'|'onToolMeasurementChange'|'onRegisterMeasurementActions'|'unitSystem'> & {completedSessions:RefObject<Set<string>>}) {
  const canvas=useThree(state=>state.gl.domElement);
  const camera=useThree(state=>state.camera);
  const viewportSize=useThree(state=>state.size);
  const rotationGizmoRef=useRef<THREE.Group>(null);
  const moveGizmoRef=useRef<THREE.Group>(null);
  const [transformGesture,setTransformGesture]=useState<TransformGesture>();  const transformGestureRef=useRef(transformGesture);
  useLayoutEffect(()=>{transformGestureRef.current=transformGesture;},[transformGesture]);
  const rotationVertices=useMemo(()=>designVertices(design,editingDefinitionId),[design,editingDefinitionId]);
  const selectedInstance=design?.instances.find(item=>item.id===selectedId&&!item.hidden);
  const selectedLoose=design?.looseObjects.find(item=>item.id===selectedId&&!item.hidden);
  const selectedTransformTarget=selectedInstance??selectedLoose;
  const selectedTransformGeometry=selectedInstance?design?.definitions.find(item=>item.id===selectedInstance.definitionId)?.geometry:selectedLoose?.geometry;
  const rotationTarget=activeTool==='rotate'&&selectedTransformTarget&&!selectedTransformTarget.locked&&selectedTransformGeometry?selectedTransformTarget:undefined;
  const rotationGeometry=rotationTarget?selectedTransformGeometry:undefined;
  const moveTarget=activeTool==='move'&&selectedTransformTarget&&!selectedTransformTarget.locked?selectedTransformTarget:undefined;
  const moveGeometry=moveTarget?selectedTransformGeometry:undefined;
  const movePivotFor=useCallback((target:Instance|LooseObject,geometry:Geometry)=>{
    const local=pivotMode==='center'?geometryCenter(geometry):[0,0,0] as [number,number,number];
    return transformLocalPoint(local,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];
  },[pivotMode]);
  const movePivot=moveTarget&&moveGeometry?movePivotFor(moveTarget,moveGeometry):undefined;
  const rotationPivotFor=useCallback((target:Instance|LooseObject,geometry:Geometry):[number,number,number]=>{
    const vertex=selectedElement?.objectId===target.id&&selectedElement.type==='vertex'?selectedElement:undefined;
    const vertexLocal=vertex?rotationVertices.find(item=>item.objectId===target.id&&item.id===vertex.id)?.localPoint??geometry.vertices.find(item=>item.id===vertex.id)?.positionUm:undefined;
    const cutSpec='definitionId'in target?design?.definitions.find(definition=>definition.id===target.definitionId)?.cutSpec:undefined;
    return resolveRotationPivotLocal(geometry,rotationPivotMode,vertexLocal,cutSpec?.confirmation==='confirmed'?[0,0,0]:undefined);
  },[selectedElement,rotationVertices,design,rotationPivotMode]);
  useFrame(()=>{
    if(!rotationGizmoRef.current)return;
    const target=transformGesture?.mode==='rotate'?transformGesture.target:rotationTarget;
    const geometry=transformGesture?.mode==='rotate'?transformGesture.geometry:rotationGeometry;
    if(!target||!geometry){rotationGizmoRef.current.visible=false;return;}
    rotationGizmoRef.current.visible=true;
    const pivotLocal=rotationPivotFor(target,geometry);
    const worldPivot=transformLocalPoint(pivotLocal,target.pose,target.scalePpm).map(umToMeters) as [number,number,number];
    const point=new THREE.Vector3(...worldPivot);
    const projectedPivot=point.clone().project(camera);
    const pivotX=(projectedPivot.x+1)*viewportSize.width/2,pivotY=(1-projectedPivot.y)*viewportSize.height/2;
    const cornerRadius=rotationPivotMode==='origin'?rotationVertices.filter(vertex=>vertex.objectId===target.id).reduce((radius,vertex)=>{const projected=new THREE.Vector3(...vertex.point).project(camera);if(projected.z< -1||projected.z>1)return radius;return Math.max(radius,Math.hypot((projected.x+1)*viewportSize.width/2-pivotX,(1-projected.y)*viewportSize.height/2-pivotY));},0):0;
    const radiusPixels=rotationGizmoRadiusPixels(rotationPivotMode,cornerRadius);
    rotationGizmoRef.current.scale.setScalar(Math.max(0.0001,worldPerPixel(camera,point,viewportSize.height)*radiusPixels));
  });
  useFrame(()=>{
    if(!moveGizmoRef.current)return;
    if(!moveTarget||!moveGeometry||!movePivot){moveGizmoRef.current.visible=false;return;}
    moveGizmoRef.current.visible=true;
    const point=new THREE.Vector3(...movePivot);
    moveGizmoRef.current.scale.setScalar(Math.max(0.0001,worldPerPixel(camera,point,viewportSize.height)*42));
  });
  const transformResult=useTransformPreview({transformGesture,toolMeasurement,axisMode,moveConstraint,snap,pivotMode,unitSystem,rotationPivotFor});
  const commitTransform=useCallback((gesture=transformGesture,end=gesture?.end)=>{
    const result=transformResult(gesture,end);if(!gesture||completedSessions.current.has(gesture.sessionId))return;if(!result?.valid){onToolError('Enter a valid nonzero value for this transform');return;}completedSessions.current.add(gesture.sessionId);
    const target=gesture.target;const instance=design?.instances.some(item=>item.id===target.id);
    onCommand(instance?{type:'set-instance-transform',instanceId:target.id,pose:result.pose,...(gesture.mode==='scale'?{scalePpm:result.scalePpm,reason:'instance-scaled' as const}:{})}:{type:'set-loose-transform',objectId:target.id,pose:result.pose,...(gesture.mode==='scale'?{scalePpm:result.scalePpm}:{})});
    setTransformGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError(`${gesture.mode[0].toUpperCase()+gesture.mode.slice(1)} placed`);
  },[transformGesture,transformResult,design,onCommand,onToolMeasurementChange,onRegisterMeasurementActions,onToolError,completedSessions]);
  const cancelTransform=useCallback(()=>{setTransformGesture(undefined);onToolMeasurementChange(undefined);onRegisterMeasurementActions(undefined);onToolError('Transform canceled');},[onToolMeasurementChange,onRegisterMeasurementActions,onToolError]);
  // Synchronize the provisional transform with the selected model target; stale previews must not be committed.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(!transformGesture)return;const current=design?.instances.find(item=>item.id===transformGesture.target.id)??design?.looseObjects.find(item=>item.id===transformGesture.target.id);if(selectedId!==transformGesture.target.id||current!==transformGesture.target)cancelTransform();});
  const startTransformSession=(target:Instance|LooseObject,geometry:Geometry,start:THREE.Vector3,mode:'move'|'rotate'|'scale',id:string,rotationAxis?:RotationAxis,moveAxis?:MoveAxis,client?:[number,number],fromHandle=false,pivot?:[number,number,number],startAxisCoordinate?:number,pointerId?:number)=>{
    const gesture={mode,start:start.clone(),end:start.clone(),rotationBaseDegrees:0,sessionId:id,target,geometry,centerLocal:geometryCenter(geometry),rotationAxis,moveAxis,moveFromHandle:fromHandle,moveStartClient:client,moveLastClient:client,movePivot:pivot,moveStartAxisCoordinate:startAxisCoordinate,movePointerId:pointerId} as const;
    setTransformGesture(gesture);onToolMeasurementChange({id,tool:mode[0].toUpperCase()+mode.slice(1),rotationAxis,canPlace:false,fields:[{id:'value',label:mode==='move'?'Length':mode==='rotate'?'Angle':'Scale',value:mode==='scale'?'1':'0',unit:mode==='move'?(unitSystem==='imperial'?'in':'mm'):mode==='rotate'?'°':'×',min:mode==='move'||mode==='scale'?0.001:undefined}]});
    return gesture;
  };
  const moveGestureAtPointer=useMovePointer({moveShiftHeld,moveConstraint,camera,canvas,viewportSize,axisMode,onToolError,movePivotFor});
  const movePointerUpdater=useRef(moveGestureAtPointer);
  const transformResultUpdater=useRef(transformResult);
  const measurementUpdateRef=useRef(onToolMeasurementChange);
  const measurementSessionRef=useRef(toolMeasurement);
  useLayoutEffect(()=>{movePointerUpdater.current=moveGestureAtPointer;},[moveGestureAtPointer]);
  useLayoutEffect(()=>{transformResultUpdater.current=transformResult;},[transformResult]);
  useLayoutEffect(()=>{measurementUpdateRef.current=onToolMeasurementChange;measurementSessionRef.current=toolMeasurement;},[onToolMeasurementChange,toolMeasurement]);
  const commitTransformRef=useRef(commitTransform);
  const cancelTransformRef=useRef(cancelTransform);
  useLayoutEffect(()=>{commitTransformRef.current=commitTransform;cancelTransformRef.current=cancelTransform;},[commitTransform,cancelTransform]);
  // Store the gesture and mirror its axis label, distance, and placeability into the measurement box.
  const applyMoveUpdate=useCallback((updated:NonNullable<typeof transformGesture>)=>{
    transformGestureRef.current=updated;setTransformGesture(updated);
    const session=measurementSessionRef.current;if(session?.id!==updated.sessionId)return;
    const result=transformResultUpdater.current(updated,updated.end);if(!result)return;
    const axis=resolveMoveConstraint(moveConstraint,updated.moveAxis,updated.moveShiftAxis);
    const label=`Length${axis?` (${axis.toUpperCase()})`:''}`;
    const field=session.fields[0];
    if(field?.label===label&&(field.exact||field.value===result.display)&&session.canPlace===result.valid)return;
    const next={...session,canPlace:result.valid,fields:session.fields.map(current=>current.id===field?.id?{...current,label,...(!current.exact?{value:result.display}:{})}:current)};
    measurementSessionRef.current=next;measurementUpdateRef.current(next);
  },[moveConstraint]);
  const applyMoveUpdateRef=useRef(applyMoveUpdate);
  useLayoutEffect(()=>{applyMoveUpdateRef.current=applyMoveUpdate;},[applyMoveUpdate]);
  useEffect(()=>{
    const gesture=transformGestureRef.current;
    if(activeTool!=='move'||gesture?.mode!=='move'||!gesture.moveLastClient)return;
    const updated=movePointerUpdater.current(gesture,...gesture.moveLastClient);
    // Axis and Shift changes must immediately refresh the visible preview.
    if(updated)applyMoveUpdateRef.current(updated);
  },[activeTool,moveConstraint,moveShiftHeld]);
  const beginTransform=(event:ThreeEvent<PointerEvent>)=>{
    const instance=design?.instances.find(item=>item.id===selectedId);const loose=design?.looseObjects.find(item=>item.id===selectedId);const target=instance??loose;
    if(!target){onToolError('Select a component or loose object before transforming');return;}
    if(target.locked){onToolError('This entity is locked');return;}
    const geometry=instance?design?.definitions.find(def=>def.id===instance.definitionId)?.geometry:loose?.geometry;if(!geometry){onToolError('Transform target has no editable geometry');return;}
    const mode=activeTool as 'move'|'rotate'|'scale';
    const gesture=startTransformSession(target,geometry,event.point,mode,`${mode}-${target.id}-${globalThis.crypto.randomUUID()}`);
    if(mode==='move'){
      const withPointer={...gesture,moveStartClient:[event.nativeEvent.clientX,event.nativeEvent.clientY] as [number,number],moveLastClient:[event.nativeEvent.clientX,event.nativeEvent.clientY] as [number,number],movePivot:movePivotFor(target,geometry),movePointerId:event.pointerId};
      transformGestureRef.current=withPointer;setTransformGesture(withPointer);
    }
    onToolError(mode==='rotate'?'Choose an axis ring, then drag to preview':'Move start set · move to preview or enter a value');
  };
  const beginMoveAxisDrag=(axis:MoveAxis,event:ThreeEvent<PointerEvent>)=>{
    if(event.button!==0)return;
    event.stopPropagation();event.nativeEvent.preventDefault();
    // An active move owns pointer input through its window and canvas listeners.
    if(transformGestureRef.current?.mode==='move')return;
    const target=selectedTransformTarget;const geometry=selectedTransformGeometry;
    if(!target||!geometry){onToolError('Select a component or loose object before moving');return;}
    if(target.locked){onToolError('This entity is locked');return;}
    const pivot=movePivotFor(target,geometry);const ray=rayAtClientPoint(camera,canvas,event.nativeEvent.clientX,event.nativeEvent.clientY);
    const direction=moveAxisDirection(axis,target.pose,axisMode);
    const startCoordinate=ray&&rayAxisCoordinate(ray,new THREE.Vector3(...pivot),direction);
    if(startCoordinate===undefined){onToolError(`${axis.toUpperCase()} axis is too close to the camera direction to move; orbit the view or choose another axis`);return;}
    const client:[number,number]=[event.nativeEvent.clientX,event.nativeEvent.clientY];
    const base=startTransformSession(target,geometry,new THREE.Vector3(),'move',`move-${target.id}-${globalThis.crypto.randomUUID()}`,undefined,axis,client,true,pivot,startCoordinate,event.pointerId);
    const gesture={...base,moveAxis:axis,moveFromHandle:true,movePointerId:event.pointerId,moveStartAxisCoordinate:startCoordinate,moveLastClient:client};
    transformGestureRef.current=gesture;setTransformGesture(gesture);
    onToolMeasurementChange({id:gesture.sessionId,tool:'Move',canPlace:false,fields:[{id:'value',label:`Length (${axis.toUpperCase()})`,value:'0',unit:unitSystem==='imperial'?'in':'mm',min:0.001}]});
    onToolError(`Moving on ${axis.toUpperCase()} axis · drag and release to place`);
  };
  useEffect(()=>{
    if(!transformGesture?.moveFromHandle)return;
    const move=(event:PointerEvent)=>{
      const current=transformGestureRef.current;if(!current?.moveFromHandle||event.pointerId!==current.movePointerId)return;
      const updated=movePointerUpdater.current(current,event.clientX,event.clientY);
      if(updated)applyMoveUpdateRef.current(updated);
    };
    const end=(event:PointerEvent)=>{
      const current=transformGestureRef.current;if(!current?.moveFromHandle||event.pointerId!==current.movePointerId)return;
      const updated=event.type==='pointerup'?movePointerUpdater.current(current,event.clientX,event.clientY):undefined;
      // A click without a drag (or a cancelled pointer) must not leave the handle session following the cursor.
      if(updated&&transformResultUpdater.current(updated,updated.end)?.valid){applyMoveUpdateRef.current(updated);commitTransformRef.current(updated,updated.end);}
      else cancelTransformRef.current();
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[transformGesture?.moveFromHandle]);
  useEffect(()=>{
    if(transformGesture?.mode!=='move'||transformGesture.moveFromHandle||!transformGesture.moveStartClient)return;
    const insideCanvas=(clientX:number,clientY:number)=>{
      const bounds=canvas.getBoundingClientRect();
      return clientX>=bounds.left&&clientX<=bounds.right&&clientY>=bounds.top&&clientY<=bounds.bottom;
    };
    const move=(event:PointerEvent)=>{
      const current=transformGestureRef.current;
      if(!current||current.mode!=='move'||current.moveFromHandle||event.pointerId!==current.movePointerId||!insideCanvas(event.clientX,event.clientY))return;
      const updated=movePointerUpdater.current(current,event.clientX,event.clientY);
      if(updated)applyMoveUpdateRef.current(updated);
    };
    // Listen on the canvas itself so clicks on overlaid workspace UI never place the move.
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;
      const current=transformGestureRef.current;
      if(!current||current.mode!=='move'||current.moveFromHandle)return;
      event.preventDefault();event.stopImmediatePropagation();
      const updated=movePointerUpdater.current(current,event.clientX,event.clientY);
      if(updated){applyMoveUpdateRef.current(updated);commitTransformRef.current(updated,updated.end);}
    };
    window.addEventListener('pointermove',move);
    canvas.addEventListener('pointerdown',down,true);
    return()=>{window.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down,true);};
  },[transformGesture?.mode,transformGesture?.moveFromHandle,transformGesture?.moveStartClient,canvas]);
  const updateTransformPointer=useScalePointer({transformGesture,setTransformGesture,transformResult,toolMeasurement,onToolMeasurementChange});
  const startRotationRingDrag=useRotationGesture({transformGesture,transformGestureRef,setTransformGesture,rotationTarget,rotationGeometry,startTransformSession,rotationPivotFor,camera,canvas,toolMeasurement,onToolMeasurementChange,onToolError,transformResult,snap,commitTransform});
  useEffect(()=>{if(transformGesture&&toolMeasurement?.id===transformGesture.sessionId&&toolMeasurement.fields[0]?.exact){const result=transformResult(transformGesture);if(result&&(result.valid!==toolMeasurement.canPlace||!!toolMeasurement.fields[0]?.error===result.valid))onToolMeasurementChange({...toolMeasurement,canPlace:result.valid,fields:toolMeasurement.fields.map(field=>({...field,error:result.valid?undefined:'Value is outside the supported range'}))});}});
  return {transformGesture,transformResult,commitTransform,cancelTransform,beginTransform,updateTransformPointer,startRotationRingDrag,beginMoveAxisDrag,rotationTarget,rotationGeometry,rotationPivotFor,rotationGizmoRef,moveTarget,moveGeometry,movePivot,moveGizmoRef};
}
