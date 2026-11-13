import { useState } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { transformLocalPoint, umToMeters } from '@/lib/planner/design/geometry';
import { resolveMoveConstraint } from '../move-gesture';
import type { Props } from './DesignScene';
import type { useTransformInteractions } from './useTransformInteractions';

/**
 * Handles are drawn on top of the model (depthTest off), so they must also win picking.
 * Without this, a gizmo inside a shape sits behind the model surface in ray order and the
 * model receives the pointer event first. Reporting distance 0 sorts handle hits first.
 */
function priorityRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  const hits: THREE.Intersection[] = [];
  THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
  for (const hit of hits) intersects.push({ ...hit, distance: 0 });
}

type GizmoProps =ReturnType<typeof useTransformInteractions> & Pick<Props, 'axisMode'|'moveConstraint'|'toolMeasurement'>;
export function TransformGizmos({rotationTarget,rotationGeometry,rotationPivotFor,rotationGizmoRef,transformGesture,startRotationRingDrag,moveTarget,moveGeometry,movePivot,moveGizmoRef,axisMode,moveConstraint,beginMoveAxisDrag,toolMeasurement}:GizmoProps) {
  const [hoveredAxis,setHoveredAxis]=useState<'x'|'y'|'z'|undefined>();
  return <>
    {rotationTarget&&rotationGeometry&&(()=>{const center=transformLocalPoint(rotationPivotFor(rotationTarget,rotationGeometry),rotationTarget.pose,rotationTarget.scalePpm).map(umToMeters) as [number,number,number];const selectedAxis=toolMeasurement?.tool==='Rotate'?toolMeasurement.rotationAxis:transformGesture?.mode==='rotate'?transformGesture.rotationAxis:undefined;return <group ref={rotationGizmoRef} position={center} renderOrder={20}>
        <mesh raycast={()=>null}><sphereGeometry args={[.13,12,8]} /><meshBasicMaterial color="#fff4bd" depthTest={false} /></mesh>
        {(['x','y','z'] as const).map((axis,index)=>{const color=axis==='x'?'#ee6666':axis==='y'?'#65c886':'#64b5f6';const radius=1+index*.16;const rotation=axis==='x'?[0,Math.PI/2,0] as [number,number,number]:axis==='y'?[Math.PI/2,0,0] as [number,number,number]:[0,0,0] as [number,number,number];return <group key={axis} rotation={rotation}>
          <mesh raycast={()=>null} renderOrder={21}><torusGeometry args={[radius,.035,8,96]} /><meshBasicMaterial color={selectedAxis===axis?'#fff4bd':color} transparent opacity={selectedAxis===axis?1:.92} depthTest={false} depthWrite={false} /></mesh>
          <mesh onPointerDown={event=>startRotationRingDrag(axis,event)} renderOrder={22}><torusGeometry args={[radius,.2,6,96]} /><meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} /></mesh>
        </group>;})}
      </group>;})()}
    {moveTarget&&moveGeometry&&movePivot&&<group ref={moveGizmoRef} position={movePivot} quaternion={axisMode==='local'?new THREE.Quaternion(...moveTarget.pose.rotation):new THREE.Quaternion()} renderOrder={30}>
      {(['x','y','z'] as const).map(axis=>{
        const color=axis==='x'?'#d94646':axis==='y'?'#289853':'#2676bd';
        const active=resolveMoveConstraint(moveConstraint,transformGesture?.moveAxis,transformGesture?.moveShiftAxis)===axis||hoveredAxis===axis;
        const rotation=axis==='x'?[0,0,-Math.PI/2] as [number,number,number]:axis==='y'?[0,0,0] as [number,number,number]:[Math.PI/2,0,0] as [number,number,number];
        const onDown=(event:ThreeEvent<PointerEvent>)=>beginMoveAxisDrag(axis,event);
        const stopHandleClick=(event:ThreeEvent<MouseEvent>)=>{if(event.button===0)event.stopPropagation();};
        // Nested groups reset group render order, so each visible part sets its own to always draw after the model.
        return <group key={axis} rotation={rotation} renderOrder={30}>
          <mesh position={[0,.27,0]} raycast={()=>null} renderOrder={30}><cylinderGeometry args={[.035,.035,.54,8]}/><meshBasicMaterial color={active?'#fff1a8':color} transparent depthTest={false} depthWrite={false}/></mesh>
          <mesh position={[0,.61,0]} raycast={()=>null} renderOrder={30}><coneGeometry args={[.095,.2,10]}/><meshBasicMaterial color={active?'#fff1a8':color} transparent depthTest={false} depthWrite={false}/></mesh>
          {/* Invisible, wide hit target (about 20 px across) spanning shaft and arrowhead. It wins picking over the model. */}
          <mesh position={[0,.4,0]} userData={{moveAxis:axis}} raycast={priorityRaycast} renderOrder={31} onPointerDown={onDown} onClick={stopHandleClick} onPointerOver={event=>{event.stopPropagation();setHoveredAxis(axis);document.body.style.cursor='grab';}} onPointerOut={()=>{setHoveredAxis(current=>current===axis?undefined:current);document.body.style.cursor='';}}><cylinderGeometry args={[.25,.25,.84,8]}/><meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false}/></mesh>
          <Html position={[0,.83,0]} center style={{pointerEvents:'none'}}><span className={`design-move-axis-label${active?' is-active':''}`} aria-hidden="true">{axis.toUpperCase()}</span></Html>
        </group>;
      })}
    </group>}
  </>;
}
